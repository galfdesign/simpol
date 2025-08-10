import React from 'react'
export function Select({ value, onValueChange, children }){
  return <div className="w-full">{children({ value, onValueChange })}</div>
}

export function SelectTrigger({ children }){ return <div>{children}</div> }
export function SelectValue(){ return null }
export function SelectContent({ children }){ return <div className="mt-1">{children}</div> }
export function SelectItem({ value, children, onSelect }){
  return (
    <div
      className="px-3 py-2 rounded-lg hover:bg-gray-100 cursor-pointer border mb-1"
      onClick={()=> onSelect ? onSelect(value) : null}
      role="option"
    >{children}</div>
  )
}
