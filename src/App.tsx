import React from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppWrapper } from './components/AppWrapper';

function App() {
  return (
    <ErrorBoundary>
      <AppWrapper />
    </ErrorBoundary>
  );
}

export default App;