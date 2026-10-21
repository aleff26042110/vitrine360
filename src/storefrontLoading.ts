/** Bound read-only loading; late results cannot keep the interface waiting. */
export function storefrontLoadTimeout<T>(operation: PromiseLike<T>, message: string, milliseconds = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    Promise.resolve(operation),
    new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds) }),
  ]).finally(() => clearTimeout(timer))
}
