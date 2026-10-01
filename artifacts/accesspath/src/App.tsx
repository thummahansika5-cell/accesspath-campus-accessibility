import { useEffect, useMemo, useRef, useState } from 'react';
import type { ElementType, FormEvent, ReactNode } from 'react';
import type { ComponentProps } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Accessibility, Activity, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2,
  CircleAlert, Clock3, Compass, DoorOpen, Footprints, Heart, Info, LocateFixed,
  Map as MapIcon, MapPin, Menu, MessageSquareText,
  Navigation, Search, Send, ShieldCheck, Signpost, Sparkles, X,
} from 'lucide-react';
import {
  BrowserRouter,
  Link as RouterLink,
  Route,
  Routes,
  useLocation as useRouterLocation,
  useNavigate,
} from 'react-router-dom';
import {
  useCreateReport, useFindRoutes, useGetDashboard, useGetLocation, useGetLocations,
  useGetReports, useInterpretNeeds, useLogin, useRegister, useUpdateReportStatus,
  getGetDashboardQueryKey, getGetLocationsQueryKey, getGetReportsQueryKey, setBaseUrl,
} from '@workspace/api-client-react';
import type {
  AccessibilityReport, Location, Preferences, ReportInput, RouteOption, RoutePlan,
} from '@workspace/api-client-react';
import {
  AccessibilityReportStatus, PreferencesDistancePriority, ReportInputBarrierType,
  ReportInputUrgency, ReportStatusUpdateStatus,
} from '@workspace/api-client-react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
setBaseUrl(import.meta.env.VITE_API_BASE_URL?.trim() || null);
type AppLinkProps = Omit<ComponentProps<typeof RouterLink>, 'to'> & { href: string };
function Link({ href, ...props }: AppLinkProps) {
  return <RouterLink to={href} {...props} />;
}

const initialPreferences: Preferences = {
  avoidStairs: true, preferStepFree: true, wheelchairAccess: false, preferElevators: false,
  needAccessibleWashroom: false, avoidSteepPaths: false, distancePriority: PreferencesDistancePriority.balanced,
};

const navItems = [
  { href: '/', label: 'Overview', icon: Compass },
  { href: '/map', label: 'Explore map', icon: MapIcon },
  { href: '/route', label: 'Plan a route', icon: Signpost },
  { href: '/needs', label: 'My access needs', icon: Accessibility },
  { href: '/report', label: 'Report a barrier', icon: MessageSquareText },
  { href: '/activity', label: 'Campus activity', icon: Activity },
];

function AppShell({ children }: { children: ReactNode }) {
  const { pathname: path } = useRouterLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const userName = typeof window !== 'undefined' ? sessionStorage.getItem('accesspath:user') : null;
  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <Link href="/" className="brand-lockup" data-testid="link-brand-home" onClick={() => setMobileOpen(false)}>
        <span className="brand-mark"><Accessibility size={23} strokeWidth={2.2} /></span>
        <span><strong>AccessPath</strong><small>Campus, made navigable</small></span>
      </Link>
      <div className="side-label">YOUR CAMPUS</div>
      <nav aria-label="Main navigation" className="side-nav">
        {navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${path === href ? 'active' : ''}`} data-testid={`link-nav-${href.replace('/', '') || 'overview'}`} onClick={() => setMobileOpen(false)}>
          <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
          {href === '/report' && <span className="nav-plus">+</span>}
        </Link>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="help-card">
          <span className="help-icon"><ShieldCheck size={17} /></span>
          <strong>Built on real experiences</strong>
          <p>Campus access details grow stronger when we share what works.</p>
          <Link href="/report" className="text-link">Add what you know <ArrowRight size={14} /></Link>
        </div>
        <div className="account-row">
          <div className="account-avatar">{userName ? userName.slice(0, 1).toUpperCase() : <Accessibility size={17} />}</div>
          <div className="account-copy"><b>{userName || 'Browsing as a guest'}</b><span>{userName ? 'AccessPath account' : 'No account needed'}</span></div>
          <Link href={userName ? '/activity' : '/login'} aria-label={userName ? 'View activity' : 'Sign in'} className="account-action" data-testid="link-account"><ArrowUpRight size={16} /></Link>
        </div>
      </div>
    </aside>
    {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <main className="main-area">
      <header className="topbar">
        <button className="menu-button" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation" data-testid="button-menu"><Menu size={21} /></button>
        <div className="breadcrumb"><span>Campus guide</span><span className="crumb-divider">/</span><strong>{navItems.find(n => n.href === path)?.label ?? (path === '/login' ? 'Sign in' : path === '/register' ? 'Create account' : 'Campus guide')}</strong></div>
        <div className="topbar-actions"><span className="live-indicator"><i /> Access information, together</span><Link href="/login" className="top-login">{userName ? 'Account' : 'Sign in'} <ArrowUpRight size={15} /></Link></div>
      </header>
      <div className="sample-data-notice" role="note"><Info size={15} /><span>Demo campus data: locations and access details are samples. Verify conditions on site.</span></div>
      <div className="page-content">{children}</div>
    </main>
  </div>;
}

function PageHeading({ eyebrow, title, intro, aside }: { eyebrow: string; title: string; intro: string; aside?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{intro}</p></div>{aside}</div>;
}

function LoadingState({ label = 'Loading campus information' }: { label?: string }) {
  return <div className="loading-panel" role="status" aria-live="polite"><div className="skeleton skeleton-line wide" /><div className="skeleton skeleton-line" /><span>{label}…</span></div>;
}
function ErrorState({ retry, message = 'We couldn’t load this campus information.' }: { retry: () => void; message?: string }) {
  return <div className="state-panel error-panel"><span className="state-symbol"><CircleAlert size={20} /></span><div><strong>Couldn’t connect just now</strong><p>{message}</p></div><button className="button button-outline button-small" onClick={retry} data-testid="button-retry">Try again</button></div>;
}
function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-mark"><MapPin size={22} /></div><strong>{title}</strong><p>{body}</p>{action}</div>;
}
function StatusPill({ status }: { status: string }) {
  const cls = status.toLowerCase().includes('access') ? 'good' : status.toLowerCase().includes('partial') || status.toLowerCase().includes('review') ? 'caution' : status.toLowerCase().includes('resolved') ? 'good' : 'neutral';
  return <span className={`status-pill ${cls}`}><i />{status}</span>;
}
function Metric({ label, value, icon: Icon, tone = '' }: { label: string; value: number | string; icon: ElementType; tone?: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><div><span>{label}</span><strong>{value}</strong></div></div>;
}
function AccessTag({ children, positive = true }: { children: ReactNode; positive?: boolean }) {
  return <span className={`access-tag ${positive ? 'positive' : 'negative'}`}>{positive ? <Check size={13} /> : <X size={13} />}{children}</span>;
}

function HomePage() {
  const dash = useGetDashboard();
  const places = useGetLocations();
  return <div className="home-page">
    <section className="home-hero">
      <div className="hero-copy"><div className="hero-overline"><span className="overline-rule" /> THE CAMPUS GUIDE THAT THINKS AHEAD</div>
        <h1>Maps tell you where to go.<br /><em>AccessPath tells you</em><br />whether you can get there.</h1>
        <p>Plan your way across campus with access details you can trust — shared by the people who use these paths every day.</p>
        <div className="hero-actions"><Link href="/route" className="button button-primary" data-testid="link-start-route"><Navigation size={17} /> Plan an accessible route <ArrowRight size={16} /></Link><Link href="/map" className="button button-soft" data-testid="link-explore-campus">Explore the campus <ArrowRight size={16} /></Link></div>
        <div className="hero-assurance"><span><ShieldCheck size={16} /> Access details, not assumptions</span><span><Heart size={15} /> Made for every way of moving</span></div>
      </div>
      <div className="hero-art" aria-label="Illustrated accessible path across campus">
        <div className="art-sun" /><div className="art-label label-one"><span className="map-dot green-dot" /> Step-free entrance</div>
        <div className="art-label label-two"><span className="map-dot coral-dot" /> Your way, clearly marked</div>
        <div className="art-building building-back"><div className="building-roof" /><div className="building-windows"><i /><i /><i /></div></div>
        <div className="art-building building-front"><div className="building-roof" /><div className="building-windows"><i /><i /><i /><i /></div><div className="building-door" /></div>
        <svg className="art-route" viewBox="0 0 520 230" role="presentation"><path d="M8 205 C90 210 90 142 160 150 S230 170 258 118 S310 74 356 99 S430 128 510 28" fill="none" stroke="#f8f3e8" strokeWidth="23" strokeLinecap="round"/><path d="M8 205 C90 210 90 142 160 150 S230 170 258 118 S310 74 356 99 S430 128 510 28" fill="none" stroke="#397a70" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round"/><circle cx="8" cy="205" r="8" fill="#df8b6e"/><circle cx="510" cy="28" r="8" fill="#397a70"/></svg>
        <div className="art-tree tree-a"><span /><i /></div><div className="art-tree tree-b"><span /><i /></div><div className="art-note"><span><CheckCircle2 size={16} /></span><div><strong>A route that works for you</strong><small>Step-free · 6 min walk</small></div></div>
        <span className="art-caption">A more considered way across campus</span>
      </div>
    </section>
    <section className="quick-start">
      <div className="section-intro"><div className="eyebrow">START WHERE YOU ARE</div><h2>What do you need today?</h2><p>Go straight to the information that helps most.</p></div>
      <div className="quick-links">
        <Link href="/map" className="quick-link"><span className="quick-icon mint"><MapIcon size={19} /></span><span><b>Find a place</b><small>Entrances, lifts & washrooms</small></span><ArrowRight size={17} /></Link>
        <Link href="/needs" className="quick-link"><span className="quick-icon apricot"><MessageSquareText size={19} /></span><span><b>Tell us what works for you</b><small>Describe your access needs</small></span><ArrowRight size={17} /></Link>
        <Link href="/report" className="quick-link"><span className="quick-icon sky"><CircleAlert size={19} /></span><span><b>Share a barrier</b><small>Help someone plan ahead</small></span><ArrowRight size={17} /></Link>
      </div>
    </section>
    <section className="trust-strip"><div className="trust-heading"><div className="eyebrow">A SHARED PICTURE OF CAMPUS</div><h2>Better information.<br /><em>Fewer surprises.</em></h2><p>Campus access is always changing. AccessPath brings the latest place details and community-reported barriers into one calm, practical guide.</p><Link href="/activity" className="text-link">See what’s changing <ArrowRight size={14} /></Link></div>
      <div className="trust-data">{dash.isLoading ? <LoadingState label="Gathering campus activity" /> : dash.isError ? <ErrorState retry={() => dash.refetch()} /> : <>
        <div className="data-stat"><div className="data-number">{dash.data?.accessibleLocations ?? places.data?.length ?? '—'}</div><div><strong>places with access details</strong><span>Campus information at a glance</span></div><MapPin size={19} /></div>
        <div className="data-stat"><div className="data-number">{dash.data?.totalReports ?? '—'}</div><div><strong>community updates shared</strong><span>Every report makes planning clearer</span></div><MessageSquareText size={19} /></div>
        <div className="data-stat"><div className="data-number">{dash.data?.resolved ?? '—'}</div><div><strong>barriers marked resolved</strong><span>Progress made visible to everyone</span></div><CheckCircle2 size={19} /></div>
        <div className="data-footnote"><span className="data-pulse" /> Numbers reflect current campus reports</div>
      </>}</div>
    </section>
    <section className="home-bottom"><div className="bottom-quote"><span className="quote-mark">“</span><p>Knowing what the entrance is really like changes the whole day.</p><span>ACCESSPATH IS BUILT AROUND THE DETAILS THAT MATTER.</span></div><div className="bottom-cta"><span className="eyebrow">YOU KNOW YOUR WAY AROUND</span><h2>Make the next trip<br />easier for someone.</h2><Link href="/report" className="button button-primary">Share a campus update <ArrowRight size={16} /></Link></div></section>
  </div>;
}

function AccessibleMap({ locations, chosen, onChoose, selectedRoute, alternatives = [] }: { locations: Location[]; chosen?: string; onChoose: (id: string) => void; selectedRoute?: RouteOption | null; alternatives?: RouteOption[] }) {
  const points = locations.filter(l => Number.isFinite(l.latitude) && Number.isFinite(l.longitude));
  const center: [number, number] = points.length ? [points[0].latitude, points[0].longitude] : [0, 0];
  const pointForRoute = (route: RouteOption) => route.points.map(p => [p.latitude, p.longitude] as [number, number]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  const iconFor = (status: string, isChosen: boolean) => L.divIcon({ className: 'ap-map-marker-wrap', html: `<span class="ap-map-marker ${status === 'accessible' ? 'marker-good' : status === 'partial' ? 'marker-caution' : 'marker-limited'} ${isChosen ? 'marker-chosen' : ''}"><span></span></span>`, iconSize: [30, 38], iconAnchor: [15, 34], popupAnchor: [0, -34] });
  if (!points.length && !selectedRoute?.points?.length) return <div className="map-empty"><MapPin size={28} /><strong>Campus map is waiting for location data</strong><p>When campus places are available, they’ll appear here with their access details.</p></div>;
  const routePoints = selectedRoute ? pointForRoute(selectedRoute) : [];
  const mapCenter = routePoints.length ? routePoints[Math.floor(routePoints.length / 2)] : center;
  return <MapContainer center={mapCenter} zoom={16} scrollWheelZoom className="leaflet-map" key={`${mapCenter[0]}-${mapCenter[1]}`}>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    {points.map(location => <Marker key={location.id} position={[location.latitude, location.longitude]} icon={iconFor(location.accessibilityStatus, chosen === location.id)} eventHandlers={{ click: () => onChoose(location.id) }}>
      <Popup><div className="map-popup"><b>{location.name}</b><span>{location.type}</span><StatusPill status={location.accessibilityStatus} /><button onClick={() => onChoose(location.id)}>View access details</button></div></Popup>
    </Marker>)}
    {alternatives.filter(route => route.id !== selectedRoute?.id).map((route, i) => <Polyline key={route.id} positions={pointForRoute(route)} pathOptions={{ color: '#91a9a2', weight: 5, opacity: .72, dashArray: i % 2 ? '5 10' : undefined }} />)}
    {selectedRoute && <Polyline positions={routePoints} pathOptions={{ color: '#247d70', weight: 7, opacity: .96, lineCap: 'round', lineJoin: 'round' }} />}
  </MapContainer>;
}

function MapPage() {
  const locs = useGetLocations();
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const detail = useGetLocation(selectedId, { query: { enabled: !!selectedId, queryKey: ['/api/locations', selectedId] } });
  const filtered = useMemo(() => (locs.data ?? []).filter(l => (!search || `${l.name} ${l.type}`.toLowerCase().includes(search.toLowerCase())) && (filter === 'all' || l.accessibilityStatus === filter)), [locs.data, search, filter]);
  return <><PageHeading eyebrow="EXPLORE CAMPUS" title="Places, with the details that matter." intro="Find a building and check the access features before you set off." aside={<Link href="/report" className="button button-outline"><MessageSquareText size={16} /> Report a barrier</Link>} />
    <div className="map-workspace">
      <section className="map-list-panel">
        <div className="map-list-heading"><div><strong>Campus places</strong><span>{locs.data?.length ?? 0} places listed</span></div><span className="map-legend"><i /> Access details</span></div>
        <label className="search-field"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search buildings and places" aria-label="Search places" data-testid="input-search-places" /></label>
        <div className="filter-chips" aria-label="Filter places"><button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>All places</button><button className={filter === 'accessible' ? 'selected' : ''} onClick={() => setFilter('accessible')}>Access details</button><button className={filter === 'partial' ? 'selected' : ''} onClick={() => setFilter('partial')}>Partial</button></div>
        <div className="places-list">
          {locs.isLoading ? <LoadingState label="Finding campus places" /> : locs.isError ? <ErrorState retry={() => locs.refetch()} /> : filtered.length === 0 ? <EmptyState title="No places found" body={search ? 'Try another search or clear the filters.' : 'There are no campus locations to show yet.'} action={search ? <button className="text-link" onClick={() => { setSearch(''); setFilter('all'); }}>Clear search</button> : undefined} /> : filtered.map(place => <button key={place.id} className={`place-row ${selectedId === place.id ? 'place-selected' : ''}`} onClick={() => setSelectedId(place.id)} data-testid={`button-place-${place.id}`}>
            <span className={`place-pin ${place.accessibilityStatus}`}><MapPin size={17} /></span><span className="place-row-main"><b>{place.name}</b><small>{place.type}</small><span className="place-mini-tags">{place.stepFreeEntrance && <i>Step-free</i>}{place.elevatorAvailable && <i>Elevator</i>}{place.accessibleWashroom && <i>Washroom</i>}</span></span><ArrowRight size={16} className="place-chevron" />
          </button>)}
        </div>
      </section>
      <div className="map-display"><AccessibleMap locations={locs.data ?? []} chosen={selectedId} onChoose={setSelectedId} /><div className="map-controls-note"><LocateFixed size={15} /> Select a marker or place to see more</div></div>
      {selectedId && <section className="location-detail" aria-live="polite">
        {detail.isLoading ? <LoadingState label="Loading access details" /> : detail.isError ? <ErrorState retry={() => detail.refetch()} /> : detail.data ? <>
          <div className="detail-top"><div><div className="eyebrow">{detail.data.type}</div><h2>{detail.data.name}</h2></div><button className="icon-button" aria-label="Close details" onClick={() => setSelectedId('')}><X size={18} /></button></div>
          <StatusPill status={detail.data.accessibilityStatus} /><div className="detail-tags"><AccessTag positive={detail.data.stepFreeEntrance}>Step-free entrance</AccessTag><AccessTag positive={detail.data.rampAvailable}>Ramp</AccessTag><AccessTag positive={detail.data.elevatorAvailable}>Elevator</AccessTag><AccessTag positive={detail.data.accessibleWashroom}>Accessible washroom</AccessTag></div>
          {detail.data.notes && <p className="detail-notes"><Info size={16} />{detail.data.notes}</p>}<Link href="/route" className="button button-primary button-full">Plan a route here <ArrowRight size={16} /></Link>
        </> : null}
      </section>}
    </div>
    <div className="map-disclaimer"><Info size={15} /> Access details may change. If something doesn’t look right, please <Link href="/report">let the campus community know</Link>.</div>
  </>;
}

function RouteMap({ plan, selected, locations, onSelectPlace }: { plan: RoutePlan | null; selected: RouteOption | null; locations: Location[]; onSelectPlace: (id: string) => void }) {
  return <div className="route-map-frame"><AccessibleMap locations={locations} chosen="" onChoose={onSelectPlace} selectedRoute={selected} alternatives={plan?.routes ?? []} />{plan && selected && <div className="route-map-overlay"><span><span className="route-line-key" /> Selected route</span><span><span className="route-line-key alt-key" /> Other options</span></div>}</div>;
}

function RoutePage() {
  const locationsQuery = useGetLocations();
  const findRoutes = useFindRoutes();
  const [startId, setStartId] = useState('');
  const [endId, setEndId] = useState('');
  const autoRouteStarted = useRef(false);
  const routeRequestVersion = useRef(0);
  const [prefs, setPrefs] = useState<Preferences>(() => {
    try {
      const saved = sessionStorage.getItem('accesspath:preferences');
      return saved ? { ...initialPreferences, ...JSON.parse(saved) as Partial<Preferences> } : initialPreferences;
    } catch { return initialPreferences; }
  });
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const locations = locationsQuery.data ?? [];
  const invalidateRoute = () => {
    routeRequestVersion.current += 1;
    setPlan(null);
    setSelectedId('');
    findRoutes.reset();
  };
  const changeStart = (id: string) => {
    invalidateRoute();
    setStartId(id);
  };
  const changeDestination = (id: string) => {
    invalidateRoute();
    setEndId(id);
  };
  const updatePreferences = (update: (current: Preferences) => Preferences) => {
    invalidateRoute();
    setPrefs(update);
  };
  const requestRoutes = (originId: string, destinationId: string, preferences: Preferences) => {
    const requestVersion = ++routeRequestVersion.current;
    setPlan(null);
    setSelectedId('');
    findRoutes.mutate(
      { data: { startLocationId: originId, destinationLocationId: destinationId, preferences } },
      {
        onSuccess: result => {
          if (
            requestVersion !== routeRequestVersion.current ||
            result.start.id !== originId ||
            result.destination.id !== destinationId
          ) return;
          setPlan(result);
          setSelectedId(result.recommendedRouteId);
        },
      },
    );
  };
  useEffect(() => {
    if (autoRouteStarted.current || locations.length < 2) return;
    const start = locations.find(location => location.id === 'main-gate') ?? locations[0];
    const destination = locations.find(location => location.id === 'computer-lab') ?? locations[1];
    if (!start || !destination || start.id === destination.id) return;
    autoRouteStarted.current = true;
    setStartId(start.id);
    setEndId(destination.id);
    requestRoutes(start.id, destination.id, prefs);
  }, [locations, prefs]);
  const visiblePlan =
    plan?.start.id === startId && plan.destination.id === endId ? plan : null;
  const selectedRoute =
    visiblePlan?.routes.find(route => route.id === selectedId) ??
    visiblePlan?.routes.find(route => route.id === visiblePlan.recommendedRouteId) ??
    null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!startId || !endId || startId === endId) return;
    requestRoutes(startId, endId, prefs);
  };
  const toggle = (key: keyof Preferences) =>
    updatePreferences(current => ({ ...current, [key]: !current[key] }));
  return <><PageHeading eyebrow="ROUTE PLANNER" title="A route that works for you." intro="Compare ways across campus by the details that matter to your journey." />
    <div className="route-layout">
      <section className="route-form-card">
        <div className="form-card-title"><span className="icon-bubble mint"><Navigation size={18} /></span><div><h2>Where are you headed?</h2><p>Choose a starting point and destination.</p></div></div>
        {locationsQuery.isLoading ? <LoadingState label="Loading campus places" /> : locationsQuery.isError ? <ErrorState retry={() => locationsQuery.refetch()} /> : locations.length < 2 ? <EmptyState title="More campus places needed" body="Route planning needs at least two locations with coordinates. Check back when campus places have been added." /> : <form onSubmit={submit}>
          <label className="field-label">Starting point<select value={startId} onChange={e => changeStart(e.target.value)} required data-testid="select-route-start"><option value="">Choose a place</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <div className="route-connector"><i /><i /><span /></div>
          <label className="field-label">Destination<select value={endId} onChange={e => changeDestination(e.target.value)} required data-testid="select-route-destination"><option value="">Choose a place</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <div className="route-preferences"><div className="pref-heading"><div><strong>What should we keep in mind?</strong><small>Choose any that apply</small></div><button className="text-link" type="button" onClick={() => updatePreferences(() => initialPreferences)}>Reset</button></div>
            <div className="pref-options">
              <label className="check-row"><input type="checkbox" checked={prefs.avoidStairs} onChange={() => toggle('avoidStairs')} /><span className="custom-check"><Check size={12} /></span><Footprints size={16} /><span>Avoid stairs</span></label>
              <label className="check-row"><input type="checkbox" checked={prefs.preferStepFree} onChange={() => toggle('preferStepFree')} /><span className="custom-check"><Check size={12} /></span><span>Prefer step-free paths</span></label>
              <label className="check-row"><input type="checkbox" checked={prefs.wheelchairAccess} onChange={() => toggle('wheelchairAccess')} /><span className="custom-check"><Check size={12} /></span><Accessibility size={16} /><span>Wheelchair suitable</span></label>
              <label className="check-row"><input type="checkbox" checked={prefs.needAccessibleWashroom} onChange={() => toggle('needAccessibleWashroom')} /><span className="custom-check"><Check size={12} /></span><DoorOpen size={16} /><span>Accessible washroom</span></label>
              <label className="check-row"><input type="checkbox" checked={prefs.avoidSteepPaths} onChange={() => toggle('avoidSteepPaths')} /><span className="custom-check"><Check size={12} /></span><Footprints size={16} /><span>Avoid steep paths</span></label>
              <label className="check-row"><input type="checkbox" checked={prefs.preferElevators} onChange={() => toggle('preferElevators')} /><span className="custom-check"><Check size={12} /></span><span>Prefer elevators</span></label>
            </div>
            <label className="field-label distance-label">Distance matters<select value={prefs.distancePriority} onChange={e => updatePreferences(current => ({ ...current, distancePriority: e.target.value as Preferences['distancePriority'] }))}><option value="low">Less important</option><option value="balanced">Balance access and distance</option><option value="high">As short as possible</option></select></label>
          </div>
          {startId && startId === endId && <div className="inline-error" role="alert">Choose two different places to plan a route.</div>}
          {findRoutes.isError && <div className="inline-error" role="alert">We couldn’t find a route. Check the places and try again.</div>}
          <button className="button button-primary button-full" disabled={findRoutes.isPending || !startId || !endId || startId === endId} type="submit" data-testid="button-find-route">{findRoutes.isPending ? 'Finding routes…' : <>Compare routes <ArrowRight size={16} /></>}</button>
        </form>}
      </section>
      <div className="route-results">
        <div className="route-map-card"><RouteMap plan={visiblePlan} selected={selectedRoute} locations={locations} onSelectPlace={changeStart} />
          {!visiblePlan && <div className="map-placeholder-copy"><div className="placeholder-compass"><Compass size={23} /></div><strong>Your route will appear here</strong><span>Choose your places to see access-aware options on the map.</span></div>}
        </div>
        {!visiblePlan ? <div className="route-hint"><span className="hint-icon"><Info size={16} /></span><p><strong>Not sure what to select?</strong> Start with the building you’re in now and where you need to be next.</p></div> : <section className="route-options"><div className="options-heading"><div><div className="eyebrow">YOUR ROUTE OPTIONS</div><h2>{visiblePlan.start.name} <ArrowRight size={15} /> {visiblePlan.destination.name}</h2></div><span className="options-count">{visiblePlan.routes.length} {visiblePlan.routes.length === 1 ? 'option' : 'options'}</span></div>
          <p className="plan-reason"><Sparkles size={15} />{visiblePlan.reason}</p>
          <div className="route-option-list">{visiblePlan.routes.map(route => <button key={route.id} className={`route-option ${selectedRoute?.id === route.id ? 'route-option-active' : ''}`} onClick={() => setSelectedId(route.id)} aria-pressed={selectedRoute?.id === route.id} data-testid={`button-route-${route.id}`}>
            <div className="option-top"><div><span className="option-label">{route.label}</span>{route.id === visiblePlan.recommendedRouteId && <span className="recommended-label">RECOMMENDED</span>}</div><span className="access-score">{route.accessibilityScore}<small>/100</small></span></div>
            <div className="option-stats"><span><Footprints size={15} />{route.distanceMeters < 1000 ? `${route.distanceMeters} m` : `${(route.distanceMeters / 1000).toFixed(1)} km`}</span><span><Clock3 size={15} />{route.walkingMinutes} min</span><span><Accessibility size={15} />{route.stepFree ? 'Step-free' : route.hasStairs ? 'Has stairs' : 'Access details'}</span></div>
            <div className="option-tags"><AccessTag positive={route.wheelchairSuitable}>Wheelchair suitable</AccessTag>{route.elevatorAvailable && <AccessTag>Elevator available</AccessTag>}{route.hasStairs && <AccessTag positive={false}>Stairs on route</AccessTag>}</div>
            {selectedRoute?.id === route.id && <div className="option-explanation">{route.explanation.map((line, i) => <span key={i}><CheckCircle2 size={14} />{line}</span>)}{route.navigationInstructions && <p><Navigation size={14} />{route.navigationInstructions}</p>}{route.instructionMode === 'demo' && <small className="demo-label"><Info size={12} /> Sample route guidance</small>}</div>}
          </button>)}</div>
        </section>}
      </div>
    </div>
  </>;
}

function NeedsPage() {
  const interpret = useInterpretNeeds();
  const [description, setDescription] = useState('');
  const result = interpret.data;
  const examples = ['I use a wheelchair and need step-free routes.', 'I can walk, but stairs and steep paths are difficult.', 'I need to know where accessible washrooms are.'];
  const submit = (e: FormEvent) => { e.preventDefault(); if (description.trim().length >= 3) interpret.mutate({ data: { description: description.trim() } }); };
  return <><PageHeading eyebrow="YOUR ACCESS NEEDS" title="Tell us what works for you." intro="Put it in your own words. We’ll translate it into route preferences you can review." />
    <div className="needs-layout"><section className="needs-input-card">
      <div className="needs-card-top"><span className="icon-bubble apricot"><MessageSquareText size={19} /></span><div><strong>What should a good route take into account?</strong><span>Use everyday language. You’re in control of what’s applied.</span></div></div>
      <form onSubmit={submit}><label className="field-label" htmlFor="needs-description">Describe your access needs</label><textarea id="needs-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="For example: I need to avoid stairs and would prefer a step-free route with a lift if available." maxLength={1000} rows={5} data-testid="input-needs-description" /><div className="textarea-foot"><span>Only used to understand your route preferences.</span><span>{description.length}/1000</span></div>
        {interpret.isError && <div className="inline-error" role="alert">We couldn’t interpret that right now. Please try again.</div>}<button className="button button-primary" disabled={interpret.isPending || description.trim().length < 3} type="submit" data-testid="button-interpret-needs">{interpret.isPending ? 'Understanding your needs…' : <>Understand my needs <ArrowRight size={16} /></>}</button></form>
      <div className="example-prompts"><strong>Need a starting point?</strong>{examples.map(text => <button key={text} onClick={() => setDescription(text)}>{text}<ArrowUpRight size={13} /></button>)}</div>
    </section>
    <section className="needs-result-card">
      {interpret.isPending ? <LoadingState label="Translating your words into preferences" /> : result ? <>
        <div className="result-top"><div><div className="eyebrow">YOUR PREFERENCES</div><h2>Here’s what we understood.</h2></div><span className={`mode-badge ${result.mode}`}><Sparkles size={13} />{result.mode === 'demo' ? 'Demo AI' : 'Live interpretation'}</span></div>
        <p className="result-message">{result.message}</p><div className="understood-list">{result.understoodAs.map((item, i) => <div key={i}><span className="understood-check"><Check size={13} /></span>{item}</div>)}</div>
        <div className="result-settings"><strong>Route preferences</strong><PreferenceSummary preferences={result.preferences} /></div>
        <Link href="/route" onClick={() => { try { sessionStorage.setItem('accesspath:preferences', JSON.stringify(result.preferences)); } catch { /* Preference transfer remains optional if storage is unavailable. */ } }} className="button button-primary button-full">Use these preferences in route planner <ArrowRight size={16} /></Link>
        {result.mode === 'demo' && <p className="demo-explainer"><Info size={14} /> Demo AI mode: this interpretation is a sample. Review the preferences before using them.</p>}
      </> : <div className="result-empty"><div className="result-illustration"><MessageSquareText size={28} /><span><Sparkles size={15} /></span></div><div className="eyebrow">A CLEARER PLAN, YOUR WAY</div><h2>Your words become<br />practical route choices.</h2><p>We’ll show you the preferences we picked up, so you can decide what’s right before planning a route.</p><div className="result-promises"><span><CheckCircle2 size={15} /> Review every preference</span><span><CheckCircle2 size={15} /> Change them any time</span><span><CheckCircle2 size={15} /> No account required</span></div></div>}
    </section></div>
  </>;
}

function PreferenceSummary({ preferences }: { preferences: Preferences }) {
  const items = [
    ['Avoid stairs', preferences.avoidStairs], ['Prefer step-free paths', preferences.preferStepFree], ['Wheelchair access', preferences.wheelchairAccess],
    ['Prefer elevators', preferences.preferElevators], ['Accessible washroom needed', preferences.needAccessibleWashroom], ['Avoid steep paths', preferences.avoidSteepPaths],
  ] as [string, boolean][];
  return <div className="preference-summary">{items.filter(([, on]) => on).length ? items.filter(([, on]) => on).map(([label]) => <span key={label}><Check size={12} />{label}</span>) : <span className="muted-preference">No specific access constraints selected</span>}<span><Footprints size={12} />Distance: {preferences.distancePriority}</span></div>;
}

function ReportPage() {
  const locations = useGetLocations();
  const create = useCreateReport();
  const queryClient = useQueryClient();
  const [submitted, setSubmitted] = useState<AccessibilityReport | null>(null);
  const [locationId, setLocationId] = useState('');
  const [barrierType, setBarrierType] = useState<string>(ReportInputBarrierType.Blocked_pathway);
  const [urgency, setUrgency] = useState<string>(ReportInputUrgency.medium);
  const [description, setDescription] = useState('');
  const [impact, setImpact] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ data: { locationId, barrierType: barrierType as ReportInput['barrierType'], urgency: urgency as ReportInput['urgency'], description: description.trim(), accessibilityImpact: impact.trim() || undefined } }, {
      onSuccess: report => {
        setSubmitted(report);
        void queryClient.invalidateQueries({ queryKey: getGetReportsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetLocationsQueryKey() });
      },
    });
  };
  if (submitted) return <div className="report-success"><div className="success-orbit"><CheckCircle2 size={36} /></div><div className="eyebrow">THANK YOU FOR SHARING</div><h1>That makes campus clearer.</h1><p>Your report for <strong>{submitted.locationName}</strong> has been received. Here’s how it was understood:</p><div className="submitted-summary"><span className="summary-barrier">{submitted.barrierType}</span><h3>{submitted.summary}</h3><p>{submitted.recommendedAction}</p><div className="submitted-meta"><StatusPill status={submitted.status} /><span className={`mode-badge ${submitted.aiMode}`}><Sparkles size={13} />{submitted.aiMode === 'demo' ? 'Demo AI classification' : 'Live classification'}</span></div></div><div className="success-actions"><Link href="/activity" className="button button-primary">See campus activity <ArrowRight size={16} /></Link><button className="button button-outline" onClick={() => { setSubmitted(null); setDescription(''); setImpact(''); }}>Report another barrier</button></div></div>;
  return <><PageHeading eyebrow="COMMUNITY UPDATES" title="See a barrier? Let others know." intro="A specific, thoughtful report helps someone else make a confident plan." />
    <div className="report-layout"><form className="report-form-card" onSubmit={submit}>
      <div className="form-section"><div className="form-section-number">01</div><div className="form-section-content"><h2>Where is the barrier?</h2><p>Choose the closest place or building.</p>
        {locations.isLoading ? <LoadingState label="Loading locations" /> : locations.isError ? <ErrorState retry={() => locations.refetch()} /> : <label className="field-label">Campus place<select required value={locationId} onChange={e => setLocationId(e.target.value)} data-testid="select-report-location"><option value="">Select a place</option>{locations.data?.map(l => <option key={l.id} value={l.id}>{l.name} · {l.type}</option>)}</select></label>}
      </div></div>
      <div className="form-section"><div className="form-section-number">02</div><div className="form-section-content"><h2>What’s happening?</h2><p>Pick the closest match and describe what you encountered.</p>
        <label className="field-label">Barrier type<select value={barrierType} onChange={e => setBarrierType(e.target.value)} data-testid="select-barrier-type">{Object.values(ReportInputBarrierType).map(x => <option key={x} value={x}>{x}</option>)}</select></label>
        <label className="field-label">What did you notice?<textarea required minLength={8} maxLength={2000} rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Share the detail someone needs to know before they arrive." data-testid="input-report-description" /></label><div className="textarea-foot"><span>Be specific about where and when, if helpful.</span><span>{description.length}/2000</span></div>
        <label className="field-label impact-field">Who or what is affected? <span className="optional-label">Optional</span><textarea maxLength={1000} rows={2} value={impact} onChange={e => setImpact(e.target.value)} placeholder="For example, the only step-free entrance is blocked." data-testid="input-report-impact" /></label>
      </div></div>
      <div className="form-section"><div className="form-section-number">03</div><div className="form-section-content"><h2>How urgent is it?</h2><p>This helps people understand what to plan around.</p><div className="urgency-options">{(['low', 'medium', 'high', 'critical'] as const).map((level, i) => <label key={level} className={`urgency-choice urgency-${level} ${urgency === level ? 'urgency-selected' : ''}`}><input type="radio" name="urgency" value={level} checked={urgency === level} onChange={() => setUrgency(level)} /><span>{['Low', 'Medium', 'High', 'Critical'][i]}</span><small>{['Worth knowing', 'Plan ahead', 'May block access', 'Immediate barrier'][i]}</small></label>)}</div></div></div>
      {create.isError && <div className="inline-error" role="alert">Your report couldn’t be submitted just now. Your form details are still here—please try again.</div>}
      <div className="report-submit-row"><span><ShieldCheck size={16} /> You can share updates without an account.</span><button className="button button-primary" type="submit" disabled={create.isPending || locations.isLoading || !locationId || description.trim().length < 8} data-testid="button-submit-report">{create.isPending ? 'Sending report…' : <>Submit report <Send size={15} /></>}</button></div>
    </form><aside className="report-aside"><div className="aside-note"><span className="icon-bubble mint"><Info size={18} /></span><h3>Details help people decide.</h3><p>Tell us what changed, where it is, and whether there’s another way in. You don’t need to know the technical terms.</p></div><div className="aside-steps"><strong>What happens next</strong><div><i>1</i><span><b>Your update is shared</b><small>It appears in the campus activity feed.</small></span></div><div><i>2</i><span><b>It’s understood and categorized</b><small>AI assistance may help organize the details.</small></span></div><div><i>3</i><span><b>Everyone can plan around it</b><small>Updates help people make informed choices.</small></span></div></div><div className="ai-notice"><Sparkles size={15} /><span>AI-assisted classification is clearly labelled. Please review the details before relying on them.</span></div></aside></div>
  </>;
}

function ActivityPage() {
  const dashboard = useGetDashboard();
  const reports = useGetReports();
  const update = useUpdateReportStatus();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('All updates');
  const reportData = reports.data ?? dashboard.data?.recentReports ?? [];
  const filtered = reportData.filter(r => filter === 'All updates' || r.status === filter);
  const changeStatus = (report: AccessibilityReport, status: string) => update.mutate({ id: report.id, data: { status: status as ReportStatusUpdateStatus } }, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getGetReportsQueryKey() }); void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); } });
  return <><PageHeading eyebrow="CAMPUS ACTIVITY" title="What’s changing around campus." intro="Recent reports help everyone plan for the conditions they’ll find today." aside={<Link href="/report" className="button button-primary"><MessageSquareText size={16} /> Share an update</Link>} />
    {dashboard.isLoading ? <LoadingState label="Gathering campus activity" /> : dashboard.isError ? <ErrorState retry={() => dashboard.refetch()} /> : <>
      <div className="metrics-grid"><Metric label="All reports" value={dashboard.data?.totalReports ?? 0} icon={MessageSquareText} /><Metric label="Needs attention" value={dashboard.data?.reported ?? 0} icon={CircleAlert} tone="apricot" /><Metric label="Under review" value={dashboard.data?.underReview ?? 0} icon={Clock3} tone="sky" /><Metric label="Resolved" value={dashboard.data?.resolved ?? 0} icon={CheckCircle2} tone="mint" /></div>
      {(dashboard.data?.criticalOpen ?? 0) > 0 && <div className="critical-banner"><span><CircleAlert size={18} /></span><div><strong>{dashboard.data?.criticalOpen} critical {dashboard.data?.criticalOpen === 1 ? 'barrier' : 'barriers'} currently open</strong><small>Check recent updates before planning your trip.</small></div><ArrowRight size={16} /></div>}
    </>}
    <section className="activity-panel"><div className="activity-header"><div><div className="eyebrow">COMMUNITY REPORTS</div><h2>Latest updates</h2></div><div className="activity-filter"><label htmlFor="activity-filter">Show</label><select id="activity-filter" value={filter} onChange={e => setFilter(e.target.value)} data-testid="select-activity-filter"><option>All updates</option><option value={AccessibilityReportStatus.Reported}>Reported</option><option value={AccessibilityReportStatus.Under_Review}>Under Review</option><option value={AccessibilityReportStatus.Resolved}>Resolved</option></select></div></div>
      {reports.isLoading && !dashboard.data ? <LoadingState label="Loading community updates" /> : reports.isError && !dashboard.data?.recentReports ? <ErrorState retry={() => reports.refetch()} /> : filtered.length === 0 ? <EmptyState title={filter === 'All updates' ? 'No reports yet' : `No ${filter.toLowerCase()} updates`} body="When someone shares an access update, it will be listed here." action={<Link href="/report" className="button button-outline button-small">Share the first update</Link>} /> : <div className="activity-list">{filtered.map(report => <article className="activity-item" key={report.id} data-testid={`report-${report.id}`}>
        <div className={`activity-marker marker-${report.urgency}`}><span>{report.urgency === 'critical' || report.urgency === 'high' ? <CircleAlert size={16} /> : <MapPin size={16} />}</span><i /></div>
        <div className="activity-main"><div className="activity-item-top"><div><span className="report-category">{report.category || report.barrierType}</span><span className="activity-dot">·</span><span className="report-location">{report.locationName}</span></div><time dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time></div>
          <h3>{report.summary || report.description}</h3><p>{report.description}</p><div className="report-tags"><StatusPill status={report.status} /><span className={`severity-tag severity-${report.urgency}`}>{report.severity || report.urgency} impact</span><span className={`mode-badge ${report.aiMode}`}><Sparkles size={12} />{report.aiMode === 'demo' ? 'Demo AI' : 'Live'}</span></div>
          {report.accessibilityImpact && <div className="impact-quote"><Info size={14} />{report.accessibilityImpact}</div>}
          {report.recommendedAction && <div className="recommended-action"><span>Suggested next step</span><p>{report.recommendedAction}</p></div>}
        </div>
        <div className="status-action"><label htmlFor={`status-${report.id}`}>Update status</label><select id={`status-${report.id}`} value={report.status} disabled={update.isPending} onChange={e => changeStatus(report, e.target.value)} data-testid={`select-status-${report.id}`}><option value={ReportStatusUpdateStatus.Reported}>Reported</option><option value={ReportStatusUpdateStatus.Under_Review}>Under Review</option><option value={ReportStatusUpdateStatus.Resolved}>Resolved</option></select></div>
      </article>)}</div>}
      {update.isError && <div className="inline-error" role="alert">The status change wasn’t saved. Please try again.</div>}
    </section>
  </>;
}

function AuthPage({ register = false }: { register?: boolean }) {
  const login = useLogin();
  const create = useRegister();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const pending = login.isPending || create.isPending;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const onSuccess = (result: { token: string; user: { name: string } }) => {
      try { sessionStorage.setItem('accesspath:token', result.token); sessionStorage.setItem('accesspath:user', result.user.name); } catch { /* Private browsing may disable storage; browsing remains available. */ }
      navigate('/');
    };
    if (register) create.mutate({ data: { name: name.trim(), email: email.trim(), password } }, { onSuccess });
    else login.mutate({ data: { email: email.trim(), password } }, { onSuccess });
  };
  return <div className="auth-page"><div className="auth-aside"><div className="auth-aside-art"><div className="auth-circle one" /><div className="auth-circle two" /><div className="auth-line" /><span className="auth-marker"><MapPin size={20} /></span><div className="auth-aside-note"><ShieldCheck size={18} /><span><b>Your way is your own.</b><small>Campus access, made clearer.</small></span></div></div><div className="eyebrow">ACCESSPATH</div><h1>Good information<br />makes room for<br /><em>more possibilities.</em></h1><p>Sign in to keep your preferences close. Or keep exploring—no account is needed.</p></div>
    <section className="auth-form-panel"><Link href="/" className="back-link"><ArrowLeft size={15} /> Back to campus guide</Link><div className="auth-form-wrap"><span className="icon-bubble mint"><Accessibility size={20} /></span><div className="eyebrow">{register ? 'JOIN THE CAMPUS COMMUNITY' : 'WELCOME BACK'}</div><h2>{register ? 'Create your account.' : 'Sign in to AccessPath.'}</h2><p>{register ? 'Save a few details for a more personal planning experience.' : 'Your campus guide is right where you left it.'}</p>
      <form onSubmit={submit}>{register && <label className="field-label">Your name<input required autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Name" data-testid="input-auth-name" /></label>}<label className="field-label">Email address<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@campus.edu" data-testid="input-auth-email" /></label><label className="field-label">Password<input required type="password" minLength={8} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" data-testid="input-auth-password" /></label>
        {(login.isError || create.isError) && <div className="inline-error" role="alert">We couldn’t {register ? 'create your account' : 'sign you in'}. Check your details and try again.</div>}
        <button className="button button-primary button-full" disabled={pending} type="submit" data-testid="button-auth-submit">{pending ? 'Please wait…' : <>{register ? 'Create account' : 'Sign in'} <ArrowRight size={16} /></>}</button></form>
      <div className="auth-switch">{register ? 'Already have an account?' : 'New to AccessPath?'} <Link href={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></div><div className="auth-guest"><div className="guest-divider"><span>OR</span></div><p>Just looking around?</p><Link href="/" className="button button-outline button-full">Continue as a guest <ArrowRight size={15} /></Link><small>Routes and access information are available without signing in.</small></div>
    </div></section></div>;
}

function Router() {
  const { pathname } = useRouterLocation();
  return <ErrorBoundary resetKey={pathname}><AppShell>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/map" element={<MapPage />} />
      <Route path="/route" element={<RoutePage />} />
      <Route path="/needs" element={<NeedsPage />} />
      <Route path="/report" element={<ReportPage />} />
      <Route path="/activity" element={<ActivityPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/register" element={<AuthPage register />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </AppShell></ErrorBoundary>;
}

function App() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';
  return <QueryClientProvider client={queryClient}><TooltipProvider><BrowserRouter basename={basename}><Router /></BrowserRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;