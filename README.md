# inspector-postmortem

## Inspector Protocol Limitations

1. Can't iterate the heap with getProperties because RemoteObjectId is always
   new (even for the same object).
2. Capturing stack traces for unhandled rejections incur X overhead.
