import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import { applyCachedAppearance } from './lib/appearance.js';
import { applyCachedUiLanguage } from './i18n/translator.js';
import './styles.css';

applyCachedAppearance();
applyCachedUiLanguage();

// Trên GitHub Pages app nằm ở /<tên-repo>/; router phải biết tiền tố này, nếu không mọi route đều lệch.
// Bản Windows có BASE_URL là '/', basename thành undefined nên hành vi không đổi.
const routerBasename = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '') || undefined;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter basename={routerBasename}>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
