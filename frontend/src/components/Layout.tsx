import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { cn } from '../lib/cn';

const TAB = ({ isActive }: { isActive: boolean }) => cn('flex min-h-11 items-center rounded-lg px-4 text-white', isActive ? 'bg-blue' : 'bg-plum-2');

export function Layout() {
  const { logout } = useAuth();
  return (
    <>
      <header className="flex flex-wrap items-center gap-2 border-b-[3px] border-gold bg-plum px-4 py-2.5 text-white">
        <img src="/emblem.png" alt="" className="h-11 w-auto rounded-full bg-cream p-[3px]" />
        <h1 className="mr-auto font-script text-[1.6rem] font-semibold tracking-wide text-gold">Libreria</h1>
        <nav className="flex gap-1.5">
          <NavLink to="/scansiona" className={TAB}>Scansiona</NavLink>
          <NavLink to="/libreria" className={TAB}>Libreria</NavLink>
          <NavLink to="/note" className={TAB}>Note</NavLink>
          <button type="button" className="min-h-11 rounded-lg bg-plum-2 px-4" onClick={() => void logout()}>Esci</button>
        </nav>
      </header>
      <main className="mx-auto max-w-2xl p-4"><Outlet /></main>
    </>
  );
}
