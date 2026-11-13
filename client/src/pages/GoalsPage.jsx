import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BracketTab } from '../components/goals/BracketTab.jsx';
import { ChallengesTab } from '../components/goals/ChallengesTab.jsx';
import { FavoritesTab } from '../components/goals/FavoritesTab.jsx';
import { GoalsTab } from '../components/goals/GoalsTab.jsx';
import { TbrTab } from '../components/goals/TbrTab.jsx';
import { Input } from '../components/ui/Input.jsx';
import { TabPanel, Tabs } from '../components/ui/Tabs.jsx';

const TABS = [
  { value: 'goals', label: 'Mục tiêu năm' },
  { value: 'challenges', label: 'Challenge' },
  { value: 'tbr', label: 'TBR' },
  { value: 'favorites', label: 'Yêu thích tháng' },
  { value: 'bracket', label: 'Book bracket' },
];

export function GoalsPage() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const active = TABS.some((entry) => entry.value === tab) ? tab : 'goals';
  const year = Number(params.get('year')) || new Date().getFullYear();
  const go = (value) => navigate({ pathname: `/goals/${value}`, search: params.toString() });
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">Mục tiêu & Fun spreads</h1>
        {['goals', 'favorites', 'bracket'].includes(active) && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-muted">Năm</span>
            <Input type="number" value={year} min={1900} max={3000} onChange={(event) => event.target.value && setParams({ year: event.target.value }, { replace: true })} className="w-24" aria-label="Năm" />
          </label>
        )}
      </div>
      <Tabs value={active} onValueChange={go} tabs={TABS} label="Mục tiêu và fun spreads">
        <TabPanel value="goals"><GoalsTab year={year} /></TabPanel>
        <TabPanel value="challenges"><ChallengesTab /></TabPanel>
        <TabPanel value="tbr"><TbrTab /></TabPanel>
        <TabPanel value="favorites"><FavoritesTab year={year} /></TabPanel>
        <TabPanel value="bracket"><BracketTab year={year} /></TabPanel>
      </Tabs>
    </div>
  );
}
