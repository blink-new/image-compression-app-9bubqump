import React, { useState, useEffect } from 'react';
import { blink } from '@/blink/client';
import { LandingPage } from './LandingPage';
import ImageCompressorApp from './ImageCompressorApp';
import { Loader2 } from 'lucide-react';

interface User {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isInitialized: boolean;
}

export const AppWrapper: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    isInitialized: false
  });

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const initializeAuth = async () => {
      try {
        // Set a timeout to prevent infinite loading
        timeoutId = setTimeout(() => {
          if (mounted && !authState.isInitialized) {
            console.log('Auth initialization timeout - proceeding with unauthenticated state');
            setAuthState({
              user: null,
              isLoading: false,
              isAuthenticated: false,
              isInitialized: true
            });
          }
        }, 8000); // 8 seconds timeout

        // Initialize auth listener
        unsubscribe = blink.auth.onAuthStateChanged((state) => {
          if (!mounted) return;
          
          // Clear timeout on first successful response
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          console.log('Auth state updated:', {
            hasUser: !!state.user,
            isAuthenticated: state.isAuthenticated,
            isLoading: state.isLoading
          });

          setAuthState({
            user: state.user,
            isLoading: state.isLoading,
            isAuthenticated: state.isAuthenticated,
            isInitialized: true
          });
        });

      } catch (error) {
        console.warn('Auth initialization failed, proceeding with unauthenticated state:', error);
        if (mounted) {
          setAuthState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
            isInitialized: true
          });
        }
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (error) {
          console.warn('Error during auth cleanup:', error);
        }
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  // Show loading state only briefly during initialization
  if (authState.isLoading && !authState.isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 text-lg font-medium">Loading...</p>
          <p className="text-gray-500 text-sm mt-2">Preparing your experience</p>
        </div>
      </div>
    );
  }

  // Show landing page if not authenticated
  if (!authState.isAuthenticated) {
    return <LandingPage />;
  }

  // Show main app if authenticated
  return <ImageCompressorApp user={authState.user} />;
};