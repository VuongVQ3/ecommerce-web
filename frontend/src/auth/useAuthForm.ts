import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState, type FormEvent } from 'react'
import { useForm, type DefaultValues, type FieldValues, type Path, type Resolver, type UseFormReturn } from 'react-hook-form'
import type { z } from 'zod'
import { ApiError } from '../lib/api'

interface Options<T extends FieldValues> {
  /** Handle specific backend errors (e.g. by `code`). Return true when handled, to skip the default handling. */
  onApiError?: (error: ApiError, form: UseFormReturn<T, unknown, T>) => boolean
}

/**
 * react-hook-form + zod, plus what every auth form needs: validation on blur then on every change ("onTouched"),
 * focus on the first invalid field, backend field errors shown under the matching input, a form-level error
 * message, and a guard so a double click/tap cannot submit twice. Typed values stay in the form on errors.
 */
export function useAuthForm<T extends FieldValues>(
  schema: z.ZodType<T, T>,
  defaultValues: DefaultValues<T>,
  action: (values: T) => Promise<void>,
  options: Options<T> = {},
) {
  const form = useForm<T, unknown, T>({
    resolver: zodResolver(schema) as Resolver<T, unknown, T>,
    defaultValues,
    mode: 'onTouched',
    shouldFocusError: true,
  })
  const [formError, setFormError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const submit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await action(values)
    } catch (err) {
      if (!(err instanceof ApiError)) {
        setFormError(err instanceof Error && err.message ? err.message : 'Đã có lỗi xảy ra. Vui lòng thử lại.')
        return
      }
      if (options.onApiError?.(err, form)) return
      const fields = Object.entries(err.fieldErrors).filter(([name]) => name in defaultValues)
      fields.forEach(([name, message], i) => {
        form.setError(name as Path<T>, { type: 'server', message }, { shouldFocus: i === 0 })
      })
      if (fields.length === 0) setFormError(err.message)
    }
  })

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    if (inFlight.current) {
      e.preventDefault()
      return
    }
    inFlight.current = true
    try {
      await submit(e)
    } finally {
      inFlight.current = false
    }
  }

  return { form, onSubmit, formError, setFormError, pending: form.formState.isSubmitting }
}
