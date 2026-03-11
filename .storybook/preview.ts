import type { Preview } from "@storybook/react";
import React from "react";
import "../src/app/globals.css";
import { ToastProvider } from "../src/components/ui/Toast";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
  },
  decorators: [
    (Story) => React.createElement(ToastProvider, null, React.createElement(Story)),
  ],
};
export default preview;
