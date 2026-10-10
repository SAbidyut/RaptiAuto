// RaptiAuto virtual Raspberry Pi / Pico variant.
// Like "standard", but time.sleep(), input() and long loops yield to the browser
// (Asyncify), so the UI keeps running and GPIO inputs change while Python runs.
#define MICROPY_CONFIG_ROM_LEVEL (MICROPY_CONFIG_ROM_LEVEL_FULL_FEATURES)
#define MICROPY_ENABLE_SCHEDULER (1)
#define MICROPY_SCHEDULER_DEPTH (16)
#define MICROPY_PY_MICROPYTHON (1)
#define MICROPY_HW_BOARD_NAME "Raspberry Pi"
#define MICROPY_HW_MCU_NAME "RaptiAuto"

#define MICROPY_VM_HOOK_COUNT (64)
#define MICROPY_VM_HOOK_INIT static unsigned int vm_hook_divisor = MICROPY_VM_HOOK_COUNT;
#define MICROPY_VM_HOOK_POLL if (--vm_hook_divisor == 0) { \
        vm_hook_divisor = MICROPY_VM_HOOK_COUNT; \
        extern void rapti_vm_hook(void); \
        rapti_vm_hook(); \
}
#define MICROPY_VM_HOOK_LOOP MICROPY_VM_HOOK_POLL
#define MICROPY_VM_HOOK_RETURN MICROPY_VM_HOOK_POLL
#define MICROPY_HW_MCU_NAME_RAPTI (1)
