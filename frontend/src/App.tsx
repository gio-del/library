import { Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { useAuth } from './state/auth';
import { BooksProvider } from './state/books';
import { Layout } from './components/Layout';
import { Login } from './screens/Login';
import { Library } from './screens/Library';
import { BookDetail } from './screens/BookDetail';
import { Scan } from './screens/Scan';
import { ManualForm } from './screens/ManualForm';
import { Notes } from './screens/Notes';
import { Stats } from './screens/Stats';
import { Wishlist } from './screens/Wishlist';

export function App() {
  const { status } = useAuth();
  if (status === 'loading') return null;
  if (status === 'out') return <Login />;
  return (
    <BooksProvider>
      <ToastProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/libreria" element={<Library />} />
            <Route path="/scansiona" element={<Scan />} />
            <Route path="/note" element={<Notes />} />
          </Route>
          <Route path="/scansiona/manuale" element={<ManualForm />} />
          <Route path="/statistiche" element={<Stats />} />
          <Route path="/desideri" element={<Wishlist />} />
          <Route path="/libro/:isbn" element={<BookDetail />} />
          <Route path="*" element={<Navigate to="/libreria" replace />} />
        </Routes>
      </ToastProvider>
    </BooksProvider>
  );
}
