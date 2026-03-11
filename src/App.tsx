
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ProjectWorkspace } from './pages/ProjectWorkspace';
import { ProjectIntake } from './pages/ProjectIntake';
import { Catalog } from './pages/Catalog';
import { Settings } from './pages/Settings';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/project/new" element={<ProjectIntake />} />
          <Route path="/project/:id" element={<ProjectWorkspace />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
