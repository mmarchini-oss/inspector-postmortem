# Inspector Postmortem

This is s POC on how to use the Inspector Protocol to capture the state of a
Node.js process before it crashes due to an uncaught excpetion or unhandled
rejection. The goal is to provide a more accessible, stable and user friendly
postmortem tool which can be used to deal with most crash scenarios.

> This tool is not intended to replace core dumps entirely. It will focus on
> JavaScript crashes, while core dumps will still be useful to investigate
> crashes in native code (either on the runtime or third-party libraries).

## Demo



## Implementation Overview

> More details can be found at IMPLEMENTATION.md

The module will use the `inspector` module to interact with the inspector
protocol. We use the `Debugger` domain to pause on exceptions. The pause uses
catch prediction, which means the exception might be handled later, which means
we can't just capture the entire state of the VM at the point the exception was
thrown (that would be too expensive if the exception is handled afterwards).
Instead, we only capture the stack frames with references to their local and
closure objects. If the exception was a promiseRejection, we set callbacks to
remove the rejection on a later tick (for unhandled rejections to work, Node.js
must be ran with `--unhandled-rejections='strict'`). If it's a synchronous
exception, we save the stack frame and set a nextTick callback to delete the
stack frames (if a synchronous exception was uncaught, the process will crash
before we get into nextTick).

When the process crashes, we handle it in `process.on("uncaughtException",...)`,
where we'll get the stack frames for the synchronous exception + any possibly
unhandled rejection, and for each frame we'll use the inspector protocol to
collect the value of the local and global variables accessible for each frame.
We also save the source for all scripts in the frames on our call stack.

This information is then saved as a JSON file, which can be used to create a
WebSocket server respecting the inspector protocol, which will return the saved
values for the call stack, variables and script as if the process was paused.
There's an example server which reads these JSON crash files in this repository
as well.


## Limitations and Concerns

1. Can't iterate the heap with getProperties because RemoteObjectId is always
   new (even for the same object).
2. This approach can introduce a huge overhead since we're using the `Debugger`
   domain, which can prevent V8 optimizations in some cases (for example,
   Promises).
3. We might run out of memory while trying to capture the state of the VM
   before exiting.
4. Exit will be delayed until we finish capturing the state of the process.
   Some applications won't have a problem with that, but other applications
   won't be able to cope with the exit delay.
