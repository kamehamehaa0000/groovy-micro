export const H1 = ({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) => {
  return (
    <h1
      className={`text-2xl font-semibold tracking-tight text-foreground sm:text-3xl ${className}`}
    >
      {children}
    </h1>
  )
}

export const UpperSubHeading = ({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) => {
  return (
    <p
      className={`font-eyebrow text-eyebrow font-semibold uppercase tracking-[0.16em] text-primary-foreground/60 dark:text-muted-foreground ${className}`}
    >
      {children}
    </p>
  )
}
