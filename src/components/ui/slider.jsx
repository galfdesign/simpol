import React from 'react'

export function Slider({ min=0, max=100, step=1, value=[0], onValueChange, disabled=false }){
  const v = Array.isArray(value) ? value[0] : value
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={v}
      onChange={(e)=> onValueChange([parseFloat(e.target.value)])}
      disabled={disabled}
      className={`w-full accent-gray-800 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    />
  )
}
