import DashboardClient from "./ui/dashboard-client";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(
  value: string | string[] | undefined,
): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (Array.isArray(value) && value[0]) {
    return value[0];
  }
  return null;
}

export default async function Home({ searchParams }: PageProps) {
  const resolvedParams = (await searchParams) ?? {};
  const authMessage = readParam(resolvedParams.auth_message);
  const authLevel = readParam(resolvedParams.auth_level);

  return <DashboardClient authMessage={authMessage} authLevel={authLevel} />;
}
