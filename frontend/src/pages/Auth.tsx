import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
  Target,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Disclaimer, Mark } from "@/components/common";
import { useApp } from "@/contexts/AppContext";

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
const signUpSchema = z.object({
  name: z.string().trim().min(2, "Enter your name (at least 2 characters)."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
});
type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;

const TRUST_POINTS = [
  { icon: Lock, text: "Your password is salted and hashed. We never store it as typed." },
  { icon: ShieldCheck, text: "PortfolioPilot is not a broker and never trades for you." },
  { icon: Target, text: "Your answers shape goal tracking, stress tests and rebalancing." },
] as const;

function Field({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5 text-left">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function PasswordInput({
  id,
  autoComplete,
  invalid,
  ...rest
}: React.ComponentProps<typeof Input> & { id: string; invalid?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        aria-invalid={invalid}
        className="pr-10"
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function SignInForm() {
  const { login } = useApp();
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema) });

  const onSubmit = handleSubmit(async values => {
    setServerError("");
    try {
      // On success the router sees the signed-in user and sends them to the
      // questionnaire (not finished yet) or the dashboard (already finished).
      await login(values.email, values.password);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Sign in failed. Please try again.");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {serverError && <ErrorAlert message={serverError} />}
      <Field label="Email" id="signin-email" error={errors.email?.message}>
        <Input
          id="signin-email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          {...register("email")}
        />
      </Field>
      <Field label="Password" id="signin-password" error={errors.password?.message}>
        <PasswordInput
          id="signin-password"
          autoComplete="current-password"
          invalid={!!errors.password}
          {...register("password")}
        />
      </Field>
      <SubmitButton busy={isSubmitting} label="Sign in" busyLabel="Signing in…" />
    </form>
  );
}

function SignUpForm() {
  const { register: createAccount } = useApp();
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema) });

  const onSubmit = handleSubmit(async values => {
    setServerError("");
    try {
      await createAccount(values.name, values.email, values.password);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Sign up failed. Please try again.");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {serverError && <ErrorAlert message={serverError} />}
      <Field label="Full name" id="signup-name" error={errors.name?.message}>
        <Input
          id="signup-name"
          autoComplete="name"
          aria-invalid={!!errors.name}
          {...register("name")}
        />
      </Field>
      <Field label="Email" id="signup-email" error={errors.email?.message}>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          {...register("email")}
        />
      </Field>
      <Field label="Password" id="signup-password" error={errors.password?.message}>
        <PasswordInput
          id="signup-password"
          autoComplete="new-password"
          invalid={!!errors.password}
          {...register("password")}
        />
      </Field>
      <SubmitButton busy={isSubmitting} label="Create account" busyLabel="Creating account…" />
    </form>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="text-left">
      <AlertCircle className="size-4" aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function SubmitButton({
  busy,
  label,
  busyLabel,
}: {
  busy: boolean;
  label: string;
  busyLabel: string;
}) {
  return (
    <Button type="submit" size="lg" className="w-full gap-2" disabled={busy}>
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {busy ? busyLabel : label}
    </Button>
  );
}

export function Auth() {
  const [loc, setLoc] = useLocation();
  const reduceMotion = useReducedMotion();
  // "/register" opens Create account; "/login" (and anything else) opens Sign in.
  const mode: "signin" | "signup" = loc.startsWith("/register") ? "signup" : "signin";

  return (
    <div className="auth-shell">
      <div className="auth-art">
        <Mark />
        <div>
          <span className="eyebrow">Portfolio intelligence, made personal</span>
          <h1>Build clarity around the goals that matter.</h1>
          <ul className="mt-6 space-y-3 p-0 list-none">
            {TRUST_POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm">
                <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p>PortfolioPilot is not a broker and does not trade.</p>
      </div>

      <div className="auth-main">
        <Link href="/" className="back-link inline-flex items-center gap-2 text-sm">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to PortfolioPilot
        </Link>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <Card className="text-center shadow-lg">
            <CardHeader className="space-y-2">
              <span className="eyebrow">WELCOME</span>
              <CardTitle className="text-2xl">
                {mode === "signin" ? "Sign in to PortfolioPilot" : "Create your account"}
              </CardTitle>
              <CardDescription>
                {mode === "signin"
                  ? "Welcome back. You will go straight to your dashboard."
                  : "Takes a minute. A short questionnaire follows to personalise your workspace."}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div
                role="tablist"
                aria-label="Sign in or create account"
                className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
              >
                {(
                  [
                    ["signin", "Sign in", "/login"],
                    ["signup", "Sign up", "/register"],
                  ] as const
                ).map(([key, text, path]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={mode === key}
                    onClick={() => setLoc(path)}
                    className={
                      "rounded-md px-3 py-2 text-sm font-medium transition-colors " +
                      (mode === key
                        ? "bg-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    {text}
                  </button>
                ))}
              </div>

              {mode === "signin" ? <SignInForm key="signin" /> : <SignUpForm key="signup" />}
            </CardContent>
          </Card>
        </motion.div>

        <Disclaimer />
      </div>
    </div>
  );
}
