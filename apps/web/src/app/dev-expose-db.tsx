'use client';
import { useEffect } from 'react';
import { db } from '@/lib/db';

export default function DevExposeDB() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      (window as any).__hkdb = db;
      // console.log('Dev: __hkdb exposed');
    }
  }, []);
  return null;
}
