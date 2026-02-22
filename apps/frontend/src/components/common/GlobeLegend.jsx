import React from 'react'

export default function GlobeLegend({ SEV }) {
    const sectionHeader = {
        fontSize: 9, fontWeight: 700, color: '#334155',
        textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8,
    }

    return (
        <div style={{
            position: 'absolute', bottom: 18, left: 18,
            background: 'rgba(4,7,15,0.88)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, padding: '10px 14px',
            display: 'flex', flexDirection: 'column', gap: 7,
            backdropFilter: 'blur(8px)',
        }}>
            <p style={{ ...sectionHeader, marginBottom: 4 }}>Severity</p>
            {Object.entries(SEV).map(([key, val]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#475569' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: val.ring, boxShadow: `0 0 5px ${val.ring}` }} />
                    {val.label}
                </div>
            ))}
        </div>
    )
}
