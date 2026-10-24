import { DeveloperNav } from "@/components/developers/developer-nav";

export default function DevelopersLayout({ children }: LayoutProps<"/developers">) {
  return (
    <>
      <DeveloperNav />
      {children}
    </>
  );
}
