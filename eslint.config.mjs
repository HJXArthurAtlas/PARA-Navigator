import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/", "main.js"] },
  ...obsidianmd.configs.recommended,
  // "PARA" is an acronym; the sentence-case rule would force "Para navigator".
  { files: ["src/**/*.ts"], rules: { "obsidianmd/ui/sentence-case": "off" } },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  }
);
