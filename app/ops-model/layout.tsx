import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Weekly Operations Model",
  description: "Weekly operating model and decision workbook.",
};

export default function OperationsModelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
