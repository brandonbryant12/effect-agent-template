import { Context, Effect, Layer } from "effect";

export class Greeting extends Context.Service<
  Greeting,
  {
    readonly greet: (name: string) => Effect.Effect<string>;
  }
>()("repo/Greeting") {}

export const GreetingTest = Layer.succeed(Greeting, {
  greet: (name) => Effect.succeed(`Hello, ${name}`),
});

export const greet = (name: string) =>
  Effect.gen(function* () {
    const service = yield* Greeting;
    return yield* service.greet(name);
  });
