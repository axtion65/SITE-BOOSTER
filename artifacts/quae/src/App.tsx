import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AuthProvider } from '@/hooks/use-auth';

// Pages
import Home from '@/pages/home';
import SignIn from '@/pages/signin';
import StudioLayout from '@/pages/studio/layout';
import StudioIndex from '@/pages/studio/index';
import StudioProjects from '@/pages/studio/projects';
import StudioProjectDetail from '@/pages/studio/project-detail';
import StudioDashboard from '@/pages/studio/dashboard';
import StudioBilling from '@/pages/studio/billing';
import StudioSettings from '@/pages/studio/settings';
import BusinessPage from '@/pages/studio/business';
import BrandKitPage from '@/pages/studio/brand-kit';
import ProductsPage from '@/pages/studio/products';
import CampaignsPage from '@/pages/studio/campaigns';
import CampaignDetail from '@/pages/studio/campaign-detail';
import Templates from '@/pages/templates';
import Admin from '@/pages/admin';
import FeedbackWidget from '@/components/feedback-widget';
import { ErrorBoundary } from '@/components/error-boundary';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/signin" component={SignIn} />
      <Route path="/templates" component={() => <StudioLayout><Templates embedded /></StudioLayout>} />
      
      {/* Studio App */}
      <Route path="/studio/campaigns/:id" component={() => <StudioLayout><CampaignDetail /></StudioLayout>} />
      <Route path="/studio/campaigns" component={() => <StudioLayout><CampaignsPage /></StudioLayout>} />
      <Route path="/studio/dashboard" component={() => <StudioLayout><StudioDashboard /></StudioLayout>} />
      <Route path="/studio" component={() => <StudioLayout><StudioIndex /></StudioLayout>} />
      <Route path="/studio/projects" component={() => <StudioLayout><StudioProjects /></StudioLayout>} />
      <Route path="/studio/projects/:id" component={() => <StudioLayout><StudioProjectDetail /></StudioLayout>} />
      <Route path="/studio/billing" component={() => <StudioLayout><StudioBilling /></StudioLayout>} />
      <Route path="/studio/settings" component={() => <StudioLayout><StudioSettings /></StudioLayout>} />
      <Route path="/studio/business" component={() => <StudioLayout><BusinessPage /></StudioLayout>} />
      <Route path="/studio/brand-kit" component={() => <StudioLayout><BrandKitPage /></StudioLayout>} />
      <Route path="/studio/products" component={() => <StudioLayout><ProductsPage /></StudioLayout>} />
      
      {/* Admin */}
      <Route path="/admin" component={Admin} />
      
      <Route component={NotFound} />
    </Switch>
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
