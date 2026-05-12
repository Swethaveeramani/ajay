/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  Trash2, 
  Plus, 
  Heart, 
  ChevronRight, 
  ChevronLeft, 
  Volume2, 
  VolumeX, 
  History, 
  Sparkles,
  Share2,
  LogIn,
  LogOut,
  User
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  serverTimestamp, 
  updateDoc,
  getDocFromServer,
  setDoc
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth();

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface Memory {
  id: string;
  url: string;
  title: string;
  age?: string;
  description?: string;
  ownerId: string;
  index: number;
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isSurpriseMode, setIsSurpriseMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showFinalMessage, setShowFinalMessage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [audioUrl, setAudioUrl] = useState('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
  const [audioUrl2, setAudioUrl2] = useState('');
  const [activeTrack, setActiveTrack] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef2 = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize Audio
  useEffect(() => {
    const currentUrl = activeTrack === 1 ? audioUrl : (audioUrl2 || audioUrl);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    audioRef.current = new Audio(currentUrl);
    audioRef.current.loop = true;
    
    if (isSurpriseMode && !isMuted) {
      audioRef.current.play().catch(e => console.log("Audio play blocked", e));
    }

    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [audioUrl, audioUrl2, activeTrack]);

  // Control Audio
  useEffect(() => {
    if (isSurpriseMode && !isMuted) {
      audioRef.current?.play().catch(e => console.log("Audio play blocked by browser", e));
    } else {
      audioRef.current?.pause();
    }
  }, [isSurpriseMode, isMuted]);
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Settings Sync
  useEffect(() => {
    const path = 'settings';
    // We fetch the settings. Since it's a personal app, we just take the first one found or owner's one
    const q = query(collection(db, path));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        if (data.audioUrl) {
          setAudioUrl(data.audioUrl);
        }
        if (data.audioUrl2) {
          setAudioUrl2(data.audioUrl2);
        }
        if (data.activeTrack) {
          setActiveTrack(data.activeTrack);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const updateSettings = async (updates: Record<string, any>) => {
    if (!user) return;
    const path = `settings/${user.uid}`;
    try {
      await setDoc(doc(db, 'settings', user.uid), {
        ...updates,
        ownerId: user.uid,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  // Firestore Sync
  useEffect(() => {
    const path = 'memories';
    const q = query(
      collection(db, path), 
      orderBy('index', 'asc')
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const fetchedMemories = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Memory[];
        setMemories(fetchedMemories);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const logout = () => signOut(auth);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (!user) {
      login();
      return;
    }

    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const path = 'memories';
        try {
          await addDoc(collection(db, path), {
            url: event.target?.result as string,
            title: 'Memory ' + (memories.length + 1),
            age: '',
            description: '',
            ownerId: user.uid,
            index: memories.length,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeMemory = async (id: string) => {
    const path = `memories/${id}`;
    try {
      await deleteDoc(doc(db, 'memories', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const updateMemory = async (id: string, updates: Partial<Memory>) => {
    const path = `memories/${id}`;
    try {
      await updateDoc(doc(db, 'memories', id), {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleAudioUpload = (e: ChangeEvent<HTMLInputElement>, trackNum: number) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Check size (1MB Firestore limit)
    if (file.size > 1000000) {
      alert("Audio file is too large for cloud storage (>1MB). Please use a URL link for better quality songs, or upload a shorter clip.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const b64 = event.target?.result as string;
      if (trackNum === 1) {
        setAudioUrl(b64);
        updateSettings({ audioUrl: b64 });
      } else {
        setAudioUrl2(b64);
        updateSettings({ audioUrl2: b64 });
      }
    };
    reader.readAsDataURL(file);
  };

  const startSurprise = () => {
    if (memories.length === 0) {
      alert("Please upload some photos first!");
      return;
    }
    setIsSurpriseMode(true);
    setCurrentIndex(0);
    setShowFinalMessage(false);
  };

  const nextMemory = () => {
    if (currentIndex < memories.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setShowFinalMessage(true);
    }
  };

  const prevMemory = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isSurpriseMode) {
    return (
      <div className="min-h-screen bg-dark text-white relative font-sans overflow-y-auto">
        <AnimatePresence mode="wait">
          {!showFinalMessage ? (
            <motion.div 
              key="slideshow"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative z-10 h-screen flex flex-col items-center justify-center p-4 md:p-8"
            >
              <div className="absolute top-8 left-0 right-0 flex justify-center items-center px-8 z-20">
                <div className="flex gap-2">
                  {memories.map((_, idx) => (
                    <div 
                      key={idx} 
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        idx === currentIndex ? 'w-12 bg-brand' : 'w-2 bg-white/20'
                      }`} 
                    />
                  ))}
                </div>
              </div>

              <button 
                onClick={() => setIsSurpriseMode(false)}
                className="absolute top-8 right-8 p-3 rounded-full bg-white/5 hover:bg-white/20 transition-colors border border-white/10"
                title="Exit Surprise"
              >
                <Plus className="w-5 h-5 rotate-45" />
              </button>

              <div className="max-w-5xl w-full flex flex-col items-center">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={memories[currentIndex]?.id}
                    initial={{ opacity: 0, scale: 1.1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    className="relative aspect-[3/4] md:aspect-video w-full rounded-none overflow-hidden shadow-2xl border border-white/10 bg-black"
                  >
                    <img 
                      src={memories[currentIndex]?.url} 
                      alt={memories[currentIndex]?.title}
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                    
                    <div className="absolute bottom-0 left-0 right-0 p-6 md:p-16 text-left z-20">
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                      >
                        {memories[currentIndex]?.age && (
                          <span className="inline-block px-3 py-1 bg-brand text-black text-[10px] md:text-xs font-black uppercase tracking-[0.3em] mb-4 md:mb-6">
                            {memories[currentIndex]?.age}
                          </span>
                        )}
                        <h2 className="text-3xl md:text-8xl font-display leading-none tracking-tight uppercase mb-3 md:mb-4 text-white">
                          {memories[currentIndex]?.title}
                        </h2>
                        <p className="text-gray-300 text-sm md:text-xl max-w-3xl leading-relaxed font-light">
                          {memories[currentIndex]?.description}
                        </p>
                      </motion.div>
                    </div>
                  </motion.div>
                </AnimatePresence>

                <div className="flex flex-col md:flex-row items-center gap-6 md:gap-12 mt-8 md:mt-12">
                  <div className="flex gap-4 md:gap-12">
                    <button 
                      onClick={prevMemory}
                      disabled={currentIndex === 0}
                      className={`p-4 md:p-6 rounded-full border-2 border-white/10 hover:border-brand hover:text-brand transition-all ${currentIndex === 0 ? 'opacity-20 cursor-not-allowed' : ''}`}
                    >
                      <ChevronLeft className="w-6 h-6 md:w-8 md:h-8" />
                    </button>
                    
                    <button 
                      onClick={nextMemory}
                      className="group bg-brand text-black px-8 md:px-12 py-4 md:py-6 text-xl md:text-2xl font-black uppercase tracking-tighter hover:bg-white transition-all transform hover:scale-105 flex items-center gap-3 md:gap-4"
                    >
                      {currentIndex === memories.length - 1 ? 'THE SECRET' : 'NEXT STEP'}
                      <ChevronRight className="w-6 h-6 md:w-8 md:h-8 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="final"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative z-10 h-screen flex flex-col items-center justify-center p-8 text-center bg-black"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", damping: 15 }}
                className="mb-12"
              >
                <div className="relative inline-block text-center">
                  <div className="absolute -inset-12 bg-brand rounded-full blur-3xl opacity-20 animate-pulse" />
                  <span className="text-6xl md:text-9xl font-black text-brand italic tracking-tighter block mb-2 font-display">MAY 13</span>
                  <div className="h-1 bg-brand w-full" />
                </div>
              </motion.div>

              <motion.h1 
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="huge-text mb-8"
              >
                HAPPY<br />BIRTHDAY<br />AJAY!
              </motion.h1>

              <motion.p 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-xl md:text-3xl text-gray-400 max-w-3xl leading-relaxed mb-8 font-light"
              >
                The journey has just begun. 
                I'm so proud of the man you are becoming today.
              </motion.p>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="bg-red-950/20 border border-brand/20 p-8 rounded-3xl mb-16 max-w-2xl text-left"
              >
                <h3 className="font-display text-2xl text-brand uppercase mb-4">A Note for you</h3>
                <p className="text-white/80 leading-relaxed mb-4">
                  "Stay well, my <span className="text-brand font-bold">Thambi</span>. 
                  You are our family's happiness. Before anything else in this world, take care of <span className="text-brand">Appa and Amma</span>. 
                  Be kind, stay strong, and keep that smile that makes us all proud."
                </p>
                <p className="text-brand font-black uppercase text-sm tracking-widest">— With all my love, Akka</p>
              </motion.div>

              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="flex flex-col md:flex-row gap-6"
              >
                <button 
                  onClick={() => setIsSurpriseMode(false)}
                  className="px-12 py-5 border-2 border-white/20 text-white font-black uppercase tracking-widest hover:border-brand hover:text-brand transition-all"
                >
                  Edit Timeline
                </button>
                <button 
                  onClick={() => window.print()}
                  className="px-12 py-5 bg-brand text-black font-black uppercase tracking-widest hover:bg-white transition-all shadow-2xl shadow-brand/20"
                >
                  Share the Story
                </button>
              </motion.div>

              <div className="mt-20 flex items-center gap-4 text-brand/40">
                <div className="h-px w-12 bg-brand/30" />
                <span className="text-sm font-black uppercase tracking-[0.5em]">With Love, Swetha</span>
                <div className="h-px w-12 bg-brand/30" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button 
          onClick={() => setIsMuted(!isMuted)}
          className="fixed bottom-8 right-8 z-50 p-5 bg-white/5 backdrop-blur-3xl border border-white/10 rounded-full hover:bg-white/10 transition-all text-white/50 hover:text-brand"
        >
          {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark text-white font-sans overflow-x-hidden">
      {/* Navbar for Auth */}
      <nav className="fixed top-0 right-0 p-8 z-50">
        {!user ? (
          <button 
            onClick={login}
            className="flex items-center gap-2 px-6 py-3 bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-brand hover:text-black transition-all rounded-full font-bold uppercase tracking-widest text-xs"
          >
            <LogIn className="w-4 h-4" />
            Sign In to Save
          </button>
        ) : (
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full flex items-center gap-2">
              <User className="w-4 h-4 text-brand" />
              <span className="text-[10px] uppercase tracking-widest font-bold">{user.displayName || 'Swetha'}</span>
            </div>
            <button 
              onClick={logout}
              className="p-3 bg-white/5 border border-white/10 hover:bg-red-500/20 hover:border-red-500 text-white/50 hover:text-red-500 transition-all rounded-full"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </nav>

      <div className="flex flex-col lg:flex-row min-h-screen pb-20 lg:pb-0">
        {/* Left Section: Bold Hero Typography */}
        <section className="lg:w-[40%] xl:w-[35%] lg:h-screen lg:fixed lg:left-0 lg:top-0 min-h-[95vh] lg:min-h-0 p-8 md:p-12 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-white/10 bg-black/40 z-20 lg:overflow-y-auto">
          <div>
            <motion.p 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs tracking-[0.3em] uppercase opacity-60 mb-6 font-bold"
            >
              Happy Birthday Thambi
            </motion.p>
            <motion.h1 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="huge-text mb-8"
            >
              THE<br />JOURNEY<br />OF<br /><span className="text-white">AJAY</span><br />VEERAMANI
            </motion.h1>
          </div>
          
          <div className="mt-8 lg:mt-0">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mb-8"
            >
              <div className="text-8xl font-black mb-4 flex items-baseline gap-2">
                {memories.length}
                <span className="text-xl font-light text-white/50 uppercase tracking-widest">Memories</span>
              </div>
              <p className="text-lg max-w-xs font-light text-white/80 leading-relaxed mb-8 text-left">
                From childhood to now. A curated collection of the years we shared.
              </p>
            </motion.div>

            <div className="flex flex-col gap-4">
              {user && (
                <div className="mb-6 space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-40 block text-left">Audio Track 1 {activeTrack === 1 && '(Active)'}</label>
                      <button 
                        onClick={() => updateSettings({ activeTrack: 1 })}
                        className={`text-[9px] px-2 py-0.5 border ${activeTrack === 1 ? 'bg-brand text-black' : 'border-white/20'}`}
                      >
                        Set Active
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="Paste .mp3 link"
                        value={audioUrl.startsWith('data:') ? 'Track 1 (Uploaded File)' : audioUrl}
                        onChange={(e) => {
                          if (e.target.value.startsWith('http')) {
                            setAudioUrl(e.target.value);
                            updateSettings({ audioUrl: e.target.value });
                          }
                        }}
                        className="flex-1 bg-white/5 border border-white/10 px-4 py-2 text-xs focus:border-brand outline-none transition-all"
                      />
                      <button 
                        onClick={() => audioFileInputRef.current?.click()}
                        className="px-3 bg-white/10 hover:bg-white/20 border border-white/20 text-[10px] uppercase font-bold"
                      >
                        Upload
                      </button>
                    </div>
                    <input 
                      type="file" 
                      accept="audio/*" 
                      className="hidden" 
                      ref={audioFileInputRef}
                      onChange={(e) => handleAudioUpload(e, 1)}
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-40 block text-left">Audio Track 2 {activeTrack === 2 && '(Active)'}</label>
                      <button 
                        onClick={() => updateSettings({ activeTrack: 2 })}
                        className={`text-[9px] px-2 py-0.5 border ${activeTrack === 2 ? 'bg-brand text-black' : 'border-white/20'}`}
                      >
                        Set Active
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="Paste .mp3 link (Optional)"
                        value={audioUrl2.startsWith('data:') ? 'Track 2 (Uploaded File)' : audioUrl2}
                        onChange={(e) => {
                          if (e.target.value.startsWith('http') || e.target.value === '') {
                            setAudioUrl2(e.target.value);
                            updateSettings({ audioUrl2: e.target.value });
                          }
                        }}
                        className="flex-1 bg-white/5 border border-white/10 px-4 py-2 text-xs focus:border-brand outline-none transition-all"
                      />
                      <button 
                        onClick={() => audioFileInputRef2.current?.click()}
                        className="px-3 bg-white/10 hover:bg-white/20 border border-white/20 text-[10px] uppercase font-bold"
                      >
                        Upload
                      </button>
                    </div>
                    <input 
                      type="file" 
                      accept="audio/*" 
                      className="hidden" 
                      ref={audioFileInputRef2}
                      onChange={(e) => handleAudioUpload(e, 2)}
                    />
                  </div>
                </div>
              )}
              
              <button 
                onClick={startSurprise}
                className="group flex items-center justify-between px-8 py-5 bg-brand text-black font-black uppercase tracking-tighter text-xl hover:bg-white transition-all transform hover:-translate-y-1"
              >
                <span>Watch Surprise</span>
                <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </button>
              
              <button 
                onClick={() => user ? fileInputRef.current?.click() : login()}
                className="flex items-center justify-center gap-2 px-8 py-4 border-2 border-white/10 hover:border-brand hover:text-brand transition-all font-bold uppercase tracking-widest text-xs"
              >
                <Plus className="w-5 h-5" />
                {user ? 'Add New Moments' : 'Sign in to Add'}
              </button>
            </div>
            
            <div className="mt-12 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full border-2 border-brand flex items-center justify-center text-brand">
                <Heart className="w-6 h-6 fill-current" />
              </div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-brand italic">With Love, Swetha</p>
            </div>
          </div>
        </section>

        {/* Right Section: Memory Wall */}
        <section className="lg:ml-[40%] xl:ml-[35%] flex-1 p-8 md:p-12 lg:p-20">
          <div className="mb-16">
            <div className="timeline-line mb-6"></div>
            <div className="flex justify-between items-center text-[10px] uppercase tracking-[0.4em] opacity-40 font-bold">
              <span>Beginning</span>
              <span>The Growth</span>
              <span>Present Day</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">
            <AnimatePresence>
              {memories.map((memory, index) => (
                <motion.div 
                  key={memory.id}
                  layout
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0,
                    rotate: index % 2 === 0 ? -1.5 : 1.5,
                    translateY: 0
                  }}
                  whileHover={{ 
                    rotate: 0, 
                    scale: 1.02,
                    translateY: -8,
                    zIndex: 10 
                  }}
                  className="photo-card group shadow-2xl"
                >
                  <img 
                    src={memory.url} 
                    alt={memory.title} 
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                    referrerPolicy="no-referrer"
                  />
                  
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60 group-hover:opacity-40 transition-all" />
                  
                  <span className="year-label">{memory.age || '—'}</span>

                  <div className="absolute top-4 right-4 flex gap-2 translate-y-[-10px] opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all z-20">
                    {user && memory.ownerId === user.uid && (
                      <button 
                        onClick={() => removeMemory(memory.id)}
                        className="p-2 bg-red-600 text-white rounded-md hover:bg-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="absolute inset-x-0 bottom-0 p-8 transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all text-left">
                    <input 
                      type="text" 
                      value={memory.age || ''}
                      placeholder="Age/Year"
                      onChange={(e) => updateMemory(memory.id, { age: e.target.value })}
                      disabled={!user || memory.ownerId !== user.uid}
                      className="text-[10px] font-black uppercase tracking-[0.3em] text-brand mb-2 bg-transparent outline-none border-b border-brand/30 focus:border-brand w-full disabled:border-transparent"
                    />
                    <input 
                      type="text" 
                      value={memory.title || ''}
                      placeholder="Title"
                      onChange={(e) => updateMemory(memory.id, { title: e.target.value })}
                      disabled={!user || memory.ownerId !== user.uid}
                      className="text-2xl font-display uppercase tracking-tight text-white mb-2 bg-transparent outline-none w-full"
                    />
                    <textarea 
                      value={memory.description || ''}
                      placeholder="Message..."
                      onChange={(e) => updateMemory(memory.id, { description: e.target.value })}
                      disabled={!user || memory.ownerId !== user.uid}
                      className="text-sm text-white/70 bg-transparent outline-none w-full resize-none h-12 leading-snug"
                    />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {user && (
              <motion.button 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => fileInputRef.current?.click()}
                className="photo-card flex flex-col items-center justify-center border-2 border-dashed border-white/10 hover:border-brand/40 hover:bg-white/5 transition-all min-h-[400px]"
              >
                <Plus className="w-12 h-12 text-white/20 mb-4" />
                <span className="text-xs uppercase tracking-[0.2em] font-black text-white/40 group-hover:text-brand transition-colors">Add Memory</span>
              </motion.button>
            )}
          </div>
        </section>
      </div>

      <input 
        type="file" 
        multiple 
        accept="image/*" 
        className="hidden" 
        ref={fileInputRef}
        onChange={handleFileUpload}
      />
    </div>
  );
}
