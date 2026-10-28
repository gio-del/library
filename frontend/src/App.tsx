import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './state/auth';
import { BooksProvider } from './state/books';
import { Layout } from './components/Layout';
import { Login } from './screens/Login';
import { Library } from './screens/Library';
import { BookDetail } from './screens/BookDetail';
import { Scan } from './screens/Scan';
import { ManualForm } from './screens/ManualForm';
import { Notes } from './screens/Notes';

export function App() {
  const { status } = useAuth();
  if (status === 'loading') return null;
  if (status === 'out') return <Login />;
  return (
    <BooksProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/libreria" element={<Library />} />
          <Route path="/scansiona" element={<Scan />} />
          <Route path="/scansiona/manuale" element={<ManualForm />} />
          <Route path="/note" element={<Notes />} />
          <Route path="/libro/:isbn" element={<BookDetail />} />
          <Route path="*" element={<Navigate to="/libreria" replace />} />
        </Route>
      </Routes>
    </BooksProvider>
  );
}
