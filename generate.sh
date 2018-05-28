#!/bin/bash -x
# Generate typescript definitions and service definitions from proto files

set -e

EXAMPLES_GENERATED_DIR=examples/generated

# Determine which platform we're running on
unameOut="$(uname -s)"
case "${unameOut}" in
    Linux*)     platform=Linux;;
    Darwin*)    platform=Mac;;
    *)          platform="UNKNOWN:${unameOut}"
esac
echo "You appear to be running on ${platform}"

echo "Ensuring we have NPM packages installed..."
npm install

echo "Compiling ts-protoc-gen..."
npm run build

echo "Downloading protobuf v3.5.1... for ${platform}"
mkdir -p protoc
if [[ $platform == 'Linux' ]]; then
    curl -L https://github.com/google/protobuf/releases/download/v3.5.1/protoc-3.5.1-linux-x86_64.zip | tar xz -C protoc
elif [[ $platform == 'Mac' ]]; then
    curl -L https://github.com/google/protobuf/releases/download/v3.5.1/protoc-3.5.1-osx-x86_64.zip | tar xz -C protoc
else
    echo "Cannot download protoc. ${platform} is not currently supported by ts-protoc-gen"
    exit 1
fi

PROTOC=./protoc/bin/protoc

echo "Generating proto definitions..."

if [ -d "$EXAMPLES_GENERATED_DIR" ]
then
    rm -rf "$EXAMPLES_GENERATED_DIR"
fi
mkdir "$EXAMPLES_GENERATED_DIR"

$PROTOC \
  --plugin=protoc-gen-ts=./bin/protoc-gen-ts \
  --js_out=import_style=commonjs,binary:$EXAMPLES_GENERATED_DIR \
  --ts_out=service=true:$EXAMPLES_GENERATED_DIR \
  -I ./proto \
  ./proto/othercom/*.proto \
  ./proto/examplecom/*.proto \
  ./proto/*.proto

# Cleanup downloaded proto directory
rm -r protoc