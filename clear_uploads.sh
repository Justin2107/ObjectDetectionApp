shopt -s nullglob

jpg_files=(uploads/*.jpg)
png_files=(uploads/frames/*.png)

if [ ${#jpg_files[@]} -gt 0 ]; then
  rm "${jpg_files[@]}"
else
  echo "No .jpg files to remove in uploads/"
fi

if [ ${#png_files[@]} -gt 0 ]; then
  rm "${png_files[@]}"
else
  echo "No .png files to remove in uploads/frames/"
fi

shopt -u nullglob