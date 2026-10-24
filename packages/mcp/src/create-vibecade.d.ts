declare module "create-vibecade" {
  export const TEMPLATES: readonly { name: string; title: string; description: string }[];
  export const DEFAULT_TEMPLATE: string;
  export function scaffold(options: { targetDir: string; template?: string; name?: string; slug?: string }): {
    targetDir: string;
    template: string;
    slug: string;
    name: string;
    files: string[];
  };
}
