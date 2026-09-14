import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AuthProvider } from '@/hooks/use-auth';

// Pages
import Home from '@/pages/home';
import SignIn from '@/pages/signin';
import HowTo from '@/pages/how-to';
import FeedbackWidget from '@/components/feedback-widget';
import { ErrorBoundary } from '@/components/error-boundary';
import {
  ContactSupport,
  PrivacyPolicy,
  PublicTrustLinks,
  RefundPolicy,
  TermsOfService,
} from '@/pages/legal';

const StudioLayout = lazy(() => import('@/pages/studio/layout'));
const StudioIndex = lazy(() => import('@/pages/studio/index'));
const StudioProjects = lazy(() => import('@/pages/studio/projects'));
const StudioProjectDetail = lazy(() => import('@/pages/studio/project-detail'));
const StudioDashboard = lazy(() => import('@/pages/studio/dashboard'));
const StudioBilling = lazy(() => import('@/pages/studio/billing'));
const StudioSettings = lazy(() => import('@/pages/studio/settings'));
const BusinessPage = lazy(() => import('@/pages/studio/business'));
const BrandKitPage = lazy(() => import('@/pages/studio/brand-kit'));
const ProductsPage = lazy(() => import('@/pages/studio/products'));
const CampaignsPage = lazy(() => import('@/pages/studio/campaigns'));
const CampaignDetail = lazy(() => import('@/pages/studio/campaign-detail'));
const MockupsPage = lazy(() => import('@/pages/studio/mockups'));
const VisualsPage = lazy(() => import('@/pages/studio/visuals'));
const FreeAdPackPage = lazy(() => import('@/pages/studio/free-ad-pack'));
const Templates = lazy(() => import('@/pages/templates'));
const WebsiteImportPage = lazy(() => import('@/pages/studio/website-import'));
const Admin = lazy(() => import('@/pages/admin'));

const queryClient = new QueryClient();

function RouteLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <p role="status" className="text-sm font-medium">Loading Quae…</p>
    </main>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/signin" component={SignIn} />
        <Route path="/how-to" component={HowTo} />
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route path="/terms" component={TermsOfService} />
        <Route path="/refund-policy" component={RefundPolicy} />
        <Route path="/contact" component={ContactSupport} />
        <Route path="/templates" component={() => <StudioLayout><Templates embedded /></StudioLayout>} />

        {/* Studio App */}
        <Route path="/studio/campaigns/:id" component={() => <StudioLayout><CampaignDetail /></StudioLayout>} />
        <Route path="/studio/campaigns" component={() => <StudioLayout><CampaignsPage /></StudioLayout>} />
        <Route path="/studio/import-website" component={() => <StudioLayout><WebsiteImportPage /></StudioLayout>} />
        <Route path="/studio/dashboard" component={() => <StudioLayout><StudioDashboard /></StudioLayout>} />
        <Route path="/studio" component={() => <StudioLayout><StudioIndex /></StudioLayout>} />
        <Route path="/studio/projects" component={() => <StudioLayout><StudioProjects /></StudioLayout>} />
        <Route path="/studio/projects/:id" component={() => <StudioLayout><StudioProjectDetail /></StudioLayout>} />
        <Route path="/studio/billing" component={() => <StudioLayout><StudioBilling /></StudioLayout>} />
        <Route path="/studio/settings" component={() => <StudioLayout><StudioSettings /></StudioLayout>} />
        <Route path="/studio/business" component={() => <StudioLayout><BusinessPage /></StudioLayout>} />
        <Route path="/studio/brand-kit" component={() => <StudioLayout><BrandKitPage /></StudioLayout>} />
        <Route path="/studio/products" component={() => <StudioLayout><ProductsPage /></StudioLayout>} />
        <Route path="/studio/mockups" component={() => <StudioLayout><MockupsPage /></StudioLayout>} />
        <Route path="/studio/visuals" component={() => <StudioLayout><VisualsPage /></StudioLayout>} />
        <Route path="/studio/free-ad-pack" component={() => <StudioLayout><FreeAdPackPage /></StudioLayout>} />

        {/* Admin */}
        <Route path="/admin" component={Admin} />

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <Router />
              <PublicTrustLinks />
            </WouterRouter>
            <Toaster />
            <FeedbackWidget />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
