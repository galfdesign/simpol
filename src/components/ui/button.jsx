import React from 'react'

export function Button({ children, variant='default', size='md', className='', ...rest }){
  const sizeClass = size === 'sm'
    ? 'px-2 py-1 text-xs rounded-lg'
    : size === 'lg'
      ? 'px-4 py-2.5 text-sm rounded-xl'
      : 'px-3 py-2 text-sm rounded-xl';
  const base = `${sizeClass} shadow border transition`;
  const styles = variant==='outline'
    ? 'bg-white hover:bg-gray-50 border-gray-300 text-gray-900'
    : 'bg-gray-900 hover:bg-black border-gray-900 text-white';
  return <button className={`${base} ${styles} ${className}`} {...rest}>{children}</button>
}
