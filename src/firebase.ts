import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  inMemoryPersistence,
  signInWithCredential,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

function createResilientAuth(): Auth {
  try {
    return initializeAuth(app, {
      persistence: [
        browserLocalPersistence,
        browserSessionPersistence,
        inMemoryPersistence,
      ],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = createResilientAuth();

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleOAuth2Api {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    prompt?: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }) => {
    requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
  };
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GoogleOAuth2Api;
      };
    };
  }
}

let gsiScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Sign-In is only available in a browser.'));
  }
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gsiScriptPromise) {
    return gsiScriptPromise;
  }

  gsiScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load Google Identity Services script.')),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsiScriptPromise = null;
      reject(new Error('Failed to load Google Identity Services script.'));
    };
    document.head.appendChild(script);
  });

  return gsiScriptPromise;
}

/**
 * Direct Google OAuth token sign-in via Google Identity Services + Firebase signInWithCredential.
 * Completely bypasses Firebase's cross-origin `/__/auth/handler` sessionStorage flow, solving
 * "Unable to process request due to missing initial state" in storage-partitioned browsers,
 * embedded iframes, Safari ITP, Brave Shields, and private browsing windows.
 */
export async function signInWithGoogleDirect(): Promise<User> {
  const clientId = (firebaseConfig as { oAuthClientId?: string }).oAuthClientId?.trim();
  if (!clientId) {
    throw new Error('Google OAuth client ID is missing from Firebase configuration.');
  }

  await loadGoogleIdentityScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Google Identity Services could not initialize in this browser.');
  }

  const accessToken = await new Promise<string>((resolve, reject) => {
    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      prompt: 'select_account',
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        if (!response.access_token) {
          reject(new Error('Google did not return an access token.'));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (err) => {
        if (err?.type === 'popup_closed') {
          reject(new Error('auth/popup-closed-by-user'));
          return;
        }
        if (err?.type === 'popup_failed_to_open') {
          reject(new Error('auth/popup-blocked'));
          return;
        }
        reject(new Error(err?.message || err?.type || 'Direct Google Sign-In failed.'));
      },
    });
    tokenClient.requestAccessToken({ prompt: 'select_account' });
  });

  const credential = GoogleAuthProvider.credential(null, accessToken);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

export async function signInWithGmail(): Promise<User> {
  try {
    const credential = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
    return credential.user;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const shouldFallbackToDirect =
      msg.includes('missing-initial-state') ||
      msg.toLowerCase().includes('missing initial state') ||
      msg.includes('auth/operation-not-supported-in-this-environment') ||
      msg.includes('auth/web-storage-unsupported');

    if (shouldFallbackToDirect) {
      return signInWithGoogleDirect();
    }
    throw err;
  }
}

export function formatAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : 'Unable to sign in with Google.';
  if (raw.includes('auth/popup-closed-by-user') || raw.includes('popup_closed')) {
    return 'Sign-in popup was closed before completing authentication. If the popup showed "missing initial state", use "Direct Google Sign-In" below.';
  }
  if (raw.includes('auth/popup-blocked') || raw.includes('popup_failed_to_open')) {
    return 'Sign-in popup was blocked by your browser. Allow popups for this site and try again.';
  }
  if (raw.includes('auth/unauthorized-domain')) {
    return 'This domain is not yet authorized in Firebase Authentication settings (Authentication > Settings > Authorized domains).';
  }
  if (raw.includes('missing-initial-state') || raw.toLowerCase().includes('missing initial state')) {
    return 'Browser storage partitioning blocked the default sign-in popup. Use "Direct Google Sign-In" below or open the app in a standard browser tab.';
  }
  return raw;
}

export async function signOutAccount(): Promise<void> {
  await signOut(auth);
}
