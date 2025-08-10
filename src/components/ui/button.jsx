import React from 'react'

export function Button({ children, variant='default', ...rest }){
  const base = "px-3 py-2 rounded-xl text-sm shadow border transition";
  const styles = variant==='outline'
    ? "bg-white hover:bg-gray-50 border-gray-300 text-gray-900"
    : "bg-gray-900 hover:bg-black border-gray-900 text-white";
  return <button className={base + ' ' + styles} {...rest}>{children}</button>
}
