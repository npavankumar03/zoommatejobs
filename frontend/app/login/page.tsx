import { LoginClient } from "./LoginClient";

type SearchParams = {
  callbackUrl?: string | string[];
  error?: string | string[];
};

type LoginPageProps = {
  searchParams?: SearchParams;
};

function toSingleValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  const callbackUrl = toSingleValue(searchParams?.callbackUrl) ?? "/dashboard";
  const error = toSingleValue(searchParams?.error) ?? null;

  return <LoginClient callbackUrl={callbackUrl} error={error} />;
}
