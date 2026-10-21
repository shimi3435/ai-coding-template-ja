package main
import (
 "bytes"
 "fmt"
 "os"
 "mvdan.cc/sh/v3/syntax"
 "mvdan.cc/sh/v3/syntax/typedjson"
)
func main() {
 tree, err := syntax.NewParser(syntax.Variant(syntax.LangBash)).Parse(os.Stdin, "")
 if err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
 var out bytes.Buffer
 if err := typedjson.Encode(&out, tree); err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(2) }
 if _, err := os.Stdout.Write(out.Bytes()); err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(2) }
}
