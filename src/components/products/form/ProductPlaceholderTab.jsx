import React from 'react';

const ProductPlaceholderTab = ({ title, message }) => {
  return (
    <div className="text-center py-8 text-gray-500">
      <p className="text-sm">{title}</p>
      <p className="text-xs">{message}</p>
    </div>
  );
};

export default ProductPlaceholderTab;