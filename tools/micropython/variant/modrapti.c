// _rapti: glue between the virtual Raspberry Pi UI (JavaScript) and MicroPython.
//  - rapti_vm_hook(): called from the VM loop; yields to the browser when JavaScript asks.
//  - mp_hal_delay_ms(): time.sleep() sleeps in the browser instead of busy waiting.
//  - _rapti.input(prompt): line input from the terminal / Thonny shell.
//  - _rapti.set_dispatch(fn): fn() is scheduled whenever GPIO events (edges, timers) wait.
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>
#include "py/runtime.h"
#include "py/mphal.h"
#include "py/stream.h"
#include "library.h"

MP_REGISTER_ROOT_POINTER(mp_obj_t rapti_dispatch);

EM_JS(int, rapti_js_pending, (void), {
    return Module.raptiPending ? (Module.raptiPending() | 0) : 0;
});

// 1 when Python should give the browser a turn (about every 25 ms, but not inside a
// timing-critical window such as an ultrasonic echo that a script is measuring).
EM_JS(int, rapti_js_should_yield, (void), {
    return Module.raptiShouldYield ? (Module.raptiShouldYield() | 0) : 0;
});

EM_ASYNC_JS(char *, rapti_js_readline, (const char *prompt), {
    const p = UTF8ToString(prompt);
    const line = Module.raptiReadLine ? await Module.raptiReadLine(p) : "";
    const s = line == null ? "" : String(line); const n = lengthBytesUTF8(s) + 1; const ptr = _malloc(n); stringToUTF8(s, ptr, n); return ptr;
});

// A stopped program whose interpreter was thrown away must never run again: when its sleep
// ends, it parks on a promise that never resolves (only one interpreter may be live).
EM_JS(int, rapti_js_dead, (void), {
    return Module.raptiDead ? 1 : 0;
});

EM_ASYNC_JS(void, rapti_js_park, (void), {
    await new Promise(() => {});
});

static void rapti_check_dead(void) {
    if (rapti_js_dead()) {
        rapti_js_park();
    }
}

static void rapti_yield(int ms) {
    emscripten_sleep(ms);
    rapti_check_dead();
    if (MP_STATE_VM(rapti_dispatch) != MP_OBJ_NULL && MP_STATE_VM(rapti_dispatch) != mp_const_none && rapti_js_pending()) {
        mp_sched_schedule(MP_STATE_VM(rapti_dispatch), mp_const_none);
    }
}

void rapti_vm_hook(void) {
    if (rapti_js_should_yield()) {
        rapti_yield(0);
    }
}

void mp_hal_delay_ms(mp_uint_t ms) {
    uint32_t start = mp_hal_ticks_ms();
    for (;;) {
        mp_handle_pending(true);
        uint32_t el = mp_hal_ticks_ms() - start;
        if (el >= ms) {
            break;
        }
        uint32_t left = ms - el;
        rapti_yield(left > 20 ? 20 : left);
    }
}

void mp_hal_delay_us(mp_uint_t us) {
    if (us >= 2000) {
        mp_hal_delay_ms(us / 1000);
        return;
    }
    // short delays: busy wait on the high resolution clock
    double end = emscripten_get_now() + us / 1000.0;
    while (emscripten_get_now() < end) {
    }
}

static mp_obj_t rapti_input(size_t n_args, const mp_obj_t *args) {
    const char *prompt = "";
    if (n_args > 0) {
        mp_obj_t s = mp_call_function_1(MP_OBJ_FROM_PTR(&mp_type_str), args[0]);
        prompt = mp_obj_str_get_str(s);
    }
    char *line = rapti_js_readline(prompt);
    rapti_check_dead();
    mp_handle_pending(true);
    mp_obj_t ret = mp_obj_new_str(line, strlen(line));
    free(line);
    return ret;
}
static MP_DEFINE_CONST_FUN_OBJ_VAR_BETWEEN(rapti_input_obj, 0, 1, rapti_input);

static mp_obj_t rapti_set_dispatch(mp_obj_t fn) {
    MP_STATE_VM(rapti_dispatch) = fn;
    return mp_const_none;
}
static MP_DEFINE_CONST_FUN_OBJ_1(rapti_set_dispatch_obj, rapti_set_dispatch);

static mp_obj_t rapti_ticks_us(void) {
    return mp_obj_new_int_from_ull((unsigned long long)(emscripten_get_now() * 1000.0));
}
static MP_DEFINE_CONST_FUN_OBJ_0(rapti_ticks_us_obj, rapti_ticks_us);

static const mp_rom_map_elem_t rapti_module_globals_table[] = {
    { MP_ROM_QSTR(MP_QSTR___name__), MP_ROM_QSTR(MP_QSTR__rapti) },
    { MP_ROM_QSTR(MP_QSTR_input), MP_ROM_PTR(&rapti_input_obj) },
    { MP_ROM_QSTR(MP_QSTR_set_dispatch), MP_ROM_PTR(&rapti_set_dispatch_obj) },
    { MP_ROM_QSTR(MP_QSTR_ticks_us), MP_ROM_PTR(&rapti_ticks_us_obj) },
};
static MP_DEFINE_CONST_DICT(rapti_module_globals, rapti_module_globals_table);

const mp_obj_module_t mp_module_rapti = {
    .base = { &mp_type_module },
    .globals = (mp_obj_dict_t *)&rapti_module_globals,
};

MP_REGISTER_MODULE(MP_QSTR__rapti, mp_module_rapti);
