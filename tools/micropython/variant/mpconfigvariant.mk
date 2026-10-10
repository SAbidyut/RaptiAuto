JSFLAGS += -s ASYNCIFY -s ASYNCIFY_STACK_SIZE=65536 -s ALLOW_MEMORY_GROWTH -s ENVIRONMENT=web,worker,node
SRC_C += variants/raptipi/modrapti.c
FROZEN_MANIFEST = variants/raptipi/manifest.py
JSFLAGS += -O2
