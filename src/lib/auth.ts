import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  updateProfile
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      try {
        const token = await user.getIdToken(true);
        cachedAccessToken = token;
        if (onAuthSuccess) onAuthSuccess(user, token);
      } catch (err) {
        console.error("Error getting ID token in auth change listener:", err);
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const token = await result.user.getIdToken(true);
    cachedAccessToken = token;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (error.code !== 'auth/popup-closed-by-user') {
      console.error('Sign in error:', error);
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const emailSignUp = async (email: string, password: string, displayName: string): Promise<User> => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName });
    await sendEmailVerification(result.user);
    const token = await result.user.getIdToken(true);
    cachedAccessToken = token;
    return result.user;
  } catch (error: any) {
    console.error('Email sign up error:', error);
    throw error;
  }
};

export const emailSignIn = async (email: string, password: string): Promise<User> => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const token = await result.user.getIdToken(true);
    cachedAccessToken = token;
    return result.user;
  } catch (error: any) {
    console.error('Email sign in error:', error);
    throw error;
  }
};

export const sendVerification = async (): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('No user is currently signed in.');
  await sendEmailVerification(user);
};

export const reloadUser = async (): Promise<User | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  await user.reload();
  const refreshedUser = auth.currentUser;
  if (refreshedUser) {
    const token = await refreshedUser.getIdToken(true);
    cachedAccessToken = token;
  }
  return refreshedUser;
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getIdToken = async (): Promise<string | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken(true);
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};
