"use client";

import { MantineProvider, createTheme } from "@mantine/core";

const theme = createTheme({
  primaryColor: "green",
  fontFamily: "var(--font-inter), Inter, system-ui, sans-serif",
  colors: {
    green: [
      "#ecfdf3",
      "#d1fae0",
      "#a7f3c1",
      "#6ee79a",
      "#32d270",
      "#12843f",
      "#0f7a3d",
      "#0b6332",
      "#064e2a",
      "#04371f",
    ],
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return <MantineProvider theme={theme}>{children}</MantineProvider>;
}
