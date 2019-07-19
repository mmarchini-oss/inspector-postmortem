'use strict'

function foo(z, x, c) {
  let zet = z + x;
  throw new Error("This is an Uncaught Exception");
}

class Source {
  constructor(lala) {
    this.p = lala
  }
}


class Foo {
  constructor(biz) {
    this.biz = biz;
    this.asd = new Source(this);
  }

  func(a, b, c) {
    this.method(a, b, c);
  }

  method(a, b, c) {
    foo(a, b, { lele: true });
  }
}

function main(a) {
  const f = new Foo("lala");
  f.func(1, 2, false);
}

const m = new Map();

m.set("foo", { lero: [1, 2, 3] });

main(m);
