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
import Templates from '@/pages/templates';
import Admin from '@/pages/admin';
import SetupAdmin from '@/pages/setup-admin';
import FeedbackWidget from '@/components/feedback-widget';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/signin" component={SignIn} />
      <Route path="/templates" component={Templates} />
      
      {/* Studio App */}
      <Route path="/studio/dashboard" component={() => <StudioLayout><StudioDashboard /></StudioLayout>} />
      <Route path="/studio" component={() => <StudioLayout><StudioIndex /></StudioLayout>} />
      <Route path="/studio/projects" component={() => <StudioLayout><StudioProjects /></StudioLayout>} />
      <Route path="/studio/projects/:id" component={() => <StudioLayout><StudioProjectDetail /></StudioLayout>} />
      <Route path="/studio/billing" component={() => <StudioLayout><StudioBilling /></StudioLayout>} />
      
      {/* Admin */}
      <Route path="/admin" component={Admin} />
      <Route path="/setup-admin" component={SetupAdmin} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
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
  );
}

export default App;
