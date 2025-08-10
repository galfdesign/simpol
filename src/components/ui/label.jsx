import React from 'react'
export function Label({ children, className='' }){
  return <label className={`text-sm text-gray-700 ${className}`}>{children}</label>
}
