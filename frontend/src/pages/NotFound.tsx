import { Button, Title } from "@/components/common";
import { Layout } from "@/components/Layout";

export function NotFoundPage() {
  return (
    <Layout>
      <Title
        title="Page not found"
        sub="That route is not part of this workspace."
      />
      <Button href="/dashboard">Go to overview</Button>
    </Layout>
  );
}
