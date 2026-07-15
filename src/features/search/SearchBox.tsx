import { FormEvent, useState } from 'react';
import { normalizeDestination } from '../../domain/url';

export type SearchBoxProps = {
  searchTemplate: string;
  navigate: (destination: string) => void;
  query?: string;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
};

export function SearchBox({ searchTemplate, navigate, query, onQueryChange, placeholder = 'Search or enter an address' }: SearchBoxProps) {
  const [internalQuery, setInternalQuery] = useState('');
  const value = query ?? internalQuery;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.trim()) return;
    navigate(normalizeDestination(value, searchTemplate));
  }

  return (
    <form onSubmit={submit} aria-label="Search">
      <input
        type="search"
        role="searchbox"
        aria-label="Search or enter an address"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onQueryChange?.(event.target.value);
          if (query === undefined) setInternalQuery(event.target.value);
        }}
      />
      <button type="submit">Search</button>
    </form>
  );
}
