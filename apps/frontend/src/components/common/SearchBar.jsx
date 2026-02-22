import React from 'react'

export default function SearchBar({
    locationQuery,
    setLocationQuery,
    searchLocation,
    locationSearching,
    searchedLocation,
    setSearchedLocation
}) {
    return (
        <div style={{
            position: 'absolute', top: 14, left: 14, zIndex: 10,
            display: 'flex', gap: 5, alignItems: 'center',
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 0,
                background: 'rgba(4,7,15,0.92)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, overflow: 'hidden', backdropFilter: 'blur(10px)',
            }}>
                <span style={{ padding: '0 8px', fontSize: 12, color: '#334155', pointerEvents: 'none' }}>🔍</span>
                <input
                    value={locationQuery}
                    onChange={e => setLocationQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchLocation()}
                    placeholder="Search location…"
                    style={{
                        background: 'transparent', border: 'none', outline: 'none',
                        fontSize: 11, color: '#e2e8f0', width: 160, padding: '7px 4px',
                        fontFamily: 'inherit',
                    }}
                />
                <button
                    onClick={() => searchLocation()}
                    disabled={locationSearching}
                    style={{
                        padding: '0 10px', height: '100%', minHeight: 30,
                        background: locationSearching ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.18)',
                        border: 'none', borderLeft: '1px solid rgba(255,255,255,0.06)',
                        color: locationSearching ? '#475569' : '#818cf8',
                        fontSize: 11, cursor: locationSearching ? 'wait' : 'pointer',
                        fontWeight: 600, transition: 'all 0.15s',
                    }}
                >
                    {locationSearching ? '…' : '→'}
                </button>
            </div>
            {searchedLocation && (
                <div style={{
                    padding: '5px 10px', borderRadius: 6, fontSize: 10,
                    background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
                    color: '#818cf8', backdropFilter: 'blur(10px)',
                    display: 'flex', alignItems: 'center', gap: 6, maxWidth: 180,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                    <span style={{ color: '#f59e0b' }}>📍</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{searchedLocation.name}</span>
                    <button
                        onClick={() => { setSearchedLocation(null); setLocationQuery('') }}
                        style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1, flexShrink: 0 }}
                    >×</button>
                </div>
            )}
        </div>
    )
}
