import { Outfit } from 'next/font/google';
import './globals.css';
import './theme-contrast-fixes.css';
import "flatpickr/dist/flatpickr.css";
import { SidebarProvider } from '@/context/SidebarContext';
import { ThemeProvider } from '@/context/ThemeContext';
import GlobalInputValidation from '@/components/form/GlobalInputValidation';

const outfit = Outfit({
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${outfit.className} text-gray-700 dark:bg-gray-900 dark:text-gray-300 print:bg-white print:text-gray-900`}
      >
        <GlobalInputValidation />
        <ThemeProvider>
          <SidebarProvider>{children}</SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
