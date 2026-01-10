import { z, ZodError } from 'zod';

type FormState<T> = {
  result: T | null;
  error: ZodError | Error | null;
  isPending: boolean;
};

export function formAction<T, V extends z.ZodType<any, any>>(
  schema: V,
  action: (data: z.infer<V>) => Promise<T>
): (prevState: FormState<T>, formData: FormData) => Promise<FormState<T>> {
  return async (prevState: FormState<T>, formData: FormData): Promise<FormState<T>> => {
    try {
      const data = schema.parse(Object.fromEntries(formData.entries()));
      const result = await action(data);
      return { result, error: null, isPending: false };
    } catch (err) {
      if (err instanceof ZodError) {
        console.error('Validation error in formAction:', err.flatten());
        return { result: null, error: err, isPending: false };
      }
      console.error('Unexpected error in formAction:', err);
      return { result: null, error: err as Error, isPending: false };
    }
  };
}
