import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home/Home';
import Detalhes from './pages/Detalhes/Detalhes';

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/empresa/:id" element={<Detalhes />} />
    </Routes>
  );
};

export default AppRoutes;