import {
  ActionPanel,
  getLocalStorageItem,
  List,
  popToRoot,
  removeLocalStorageItem,
  setLocalStorageItem,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

export interface RecentSearch {
  text: string;
  timestamp: Date;
}

export async function getRecentSearches(key: string): Promise<RecentSearch[] | undefined> {
  try {
    const store = await getLocalStorageItem(key);
    const payload = store?.toString();
    if (payload) {
      const result: RecentSearch[] = [];
      const json = JSON.parse(payload);
      if (json) {
        if (Array.isArray(json)) {
          for (const r of json) {
            const t = r.text || undefined;
            let text: string | undefined;
            if (typeof t === "string") {
              text = t as string;
              if (text.length <= 0) {
                continue;
              }
            }
            const ts = r.timestamp || undefined;
            let timestamp: Date | undefined;
            if (typeof ts === "string") {
              timestamp = new Date(ts);
            } else {
              continue;
            }
            if (text && text.length > 0 && timestamp) {
              result.push({
                text: text,
                timestamp: timestamp,
              });
            }
          }
        }
        return result;
      }
    }
  } catch (error) {
    // ignore error
  }
  return [];
}

async function clearRecentSearchesStore(key: string) {
  await removeLocalStorageItem(key);
}

async function setRecentSearches(key: string, recentSearches: RecentSearch[]) {
  const payload = JSON.stringify(recentSearches);
  await setLocalStorageItem(key, payload);
}

async function appendRecentSearchesStore(key: string, search: RecentSearch) {
  const data = await getRecentSearches(key);
  if (data && data.length > 0) {
    const freshData = [search].concat(data).slice(0, 20);
    setRecentSearches(key, freshData);
  } else {
    setRecentSearches(key, [search]);
  }
}

function NoSearchItem(props: { recentQueries: RecentSearch[] | undefined }): JSX.Element | null {
  const rq = props.recentQueries;
  if (rq && rq.length > 0) {
    return null;
  } else {
    return <List.Item title="No Recent Searches" />;
  }
}

function SearchItem(props: {
  search: RecentSearch;
  setSearchText: (text: string, noDelay?: boolean | undefined) => void;
  clearAll?: () => Promise<void>;
}): JSX.Element {
  const handleClear = async () => {
    if (props.clearAll) {
      await props.clearAll();
      popToRoot();
    }
  };
  return (
    <List.Item
      title={props.search.text}
      accessoryTitle={props.search.timestamp.toLocaleString()}
      actions={
        <ActionPanel>
          <ActionPanel.Item onAction={() => props.setSearchText(props.search.text, true)} title="Search Again" />
          {props.clearAll && <ActionPanel.Item title="Clear old searches" onAction={handleClear} />}
        </ActionPanel>
      }
    />
  );
}

export function RecentSearchesList(props: {
  recentSearches: RecentSearch[] | undefined;
  setRootSearchText: (text: string, noDelay?: boolean | undefined) => void;
  isLoading?: boolean | undefined;
  clearAll?: () => Promise<void>;
}): JSX.Element {
  const setRootSearchText = props.setRootSearchText;
  const rq = props.recentSearches;
  const isLoading = props.isLoading;
  if (isLoading && !rq) {
    return <List isLoading={true} searchBarPlaceholder="Loading" />;
  }
  return (
    <List onSearchTextChange={setRootSearchText} isLoading={isLoading} throttle={true}>
      <List.Section title="Recently Searched">
        <NoSearchItem recentQueries={rq} />
        {rq?.map((q) => (
          <SearchItem
            key={q.timestamp.toLocaleString() + q.text}
            search={q}
            setSearchText={setRootSearchText}
            clearAll={props.clearAll}
          />
        ))}
      </List.Section>
    </List>
  );
}

export function useRecentSearch(
  key: string,
  setSearchText?: React.Dispatch<React.SetStateAction<string | undefined>>
): {
  data: RecentSearch[] | undefined;
  appendRecentSearches: (text: string, noDelay?: boolean | undefined) => Promise<void>;
  clearAllRecentSearches: () => Promise<void>;
} {
  const [data, setData] = useState<RecentSearch[]>();

  const dispatchAppend = async (text: string) => {
    if (setSearchText) {
      setSearchText(text);
    }
    await appendRecentSearchesStore(key, { text: text, timestamp: new Date() });
  };

  const debounced = useDebouncedCallback(dispatchAppend, 1500, { maxWait: 3000 });
  let cancel = false;

  const appendRecentSearches = async (text: string, noDelay?: boolean | undefined) => {
    if (noDelay) {
      await dispatchAppend(text);
    } else {
      debounced(text);
    }
  };

  const clearAllRecentSearches = async () => {
    await clearRecentSearchesStore(key);
  };

  useEffect(() => {
    async function fetchData(): Promise<void> {
      try {
        const d = await getRecentSearches(key);
        if (!cancel) {
          setData(d);
        }
      } catch (error) {
        // ignore
      }
    }
    fetchData();

    return () => {
      cancel = true;
      debounced.flush();
    };
  }, [debounced]);
  return { data, appendRecentSearches, clearAllRecentSearches };
}