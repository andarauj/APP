import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import * as SQLite from 'expo-sqlite';
import { initDatabase, getDatabase, isDbAvailable } from '@/db/database';
import { importExerciseDb, getImportedCount } from '@/db/exerciseDbSeed';

interface DBContextType {
  isReady: boolean;
  db: SQLite.SQLiteDatabase | null;
  dbAvailable: boolean;
  /** True while the 876-row exercise dataset is being written on first
   *  launch. Screens that list exercises can use this to explain why the
   *  library looks short instead of showing a bare empty state. */
  isImportingLibrary: boolean;
}

const DBContext = createContext<DBContextType>({
  isReady: false,
  db: null,
  dbAvailable: true,
  isImportingLibrary: false,
});

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [isImportingLibrary, setIsImportingLibrary] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await initDatabase();
        if (isDbAvailable()) {
          const database = await getDatabase();
          if (mounted) setDb(database);
        }
      } catch (err) {
        console.error('Database init failed:', err);
      } finally {
        if (mounted) setIsReady(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Importa o dataset local de exercícios (876 movimentos com ilustrações).
  //
  // Substitui duas coisas que estavam aqui antes: um fetch à API do
  // exercisedb.io — que deixou de existir nesse formato — e um gerador que
  // fabricava ~1050 nomes combinatórios com links de pesquisa do YouTube.
  // O import agora lê um ficheiro vendorizado, portanto não precisa de rede
  // e é idempotente: só insere o que ainda falta.
  useEffect(() => {
    if (!isReady) return;

    let mounted = true;
    (async () => {
      try {
        const already = await getImportedCount();
        if (already > 0) return;

        setIsImportingLibrary(true);
        importExerciseDb(undefined, (done, total) => {
          console.log(`[ExerciseDB] ${done}/${total} exercícios importados`);
        }).then(n => {
          if (mounted && n > 0) console.log(`[Database] ${n} exercícios importados`);
        }).catch(err => {
          // A app funciona com o seed curado em português mesmo sem isto,
          // por isso uma falha aqui não deve impedir o arranque.
          if (mounted) console.error('[Database] Falha ao importar biblioteca:', err);
        }).finally(() => {
          if (mounted) setIsImportingLibrary(false);
        });
      } catch (err) {
        console.error('[Database] Erro ao preparar biblioteca:', err);
      }
    })();

    return () => { mounted = false; };
  }, [isReady]);

  return (
    <DBContext.Provider value={{ isReady, db, dbAvailable: isDbAvailable(), isImportingLibrary }}>
      {children}
    </DBContext.Provider>
  );
}

export function useDatabase() {
  return useContext(DBContext);
}
