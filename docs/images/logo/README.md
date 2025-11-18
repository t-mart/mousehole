# Project Images

## Logo

The master logo is `logo.svg`. Other formats are generated from this with imagemagick:

```
magick \
  -background none \
  -density 1200 \
  docs/images/logo/logo.svg \
  -resize 512 \
  docs/images/logo/logo.png
```