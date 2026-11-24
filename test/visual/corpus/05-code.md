# 代码块

```javascript
// JavaScript
function greet(name) {
  const message = `Hello, ${name}!`;
  console.log(message);
  return message.length;
}
```

```python
# Python
def fibonacci(n: int) -> list[int]:
    result = [0, 1]
    while len(result) < n:
        result.append(result[-1] + result[-2])
    return result[:n]
```

```rust
// Rust
fn main() {
    let numbers = vec![1, 2, 3];
    let sum: i32 = numbers.iter().sum();
    println!("sum = {sum}");
}
```

```bash
# Bash
for file in *.md; do
  echo "$file"
done
```

```json
{
  "name": "marko",
  "version": "1.1.0",
  "private": true
}
```

没有语言的代码块：

```
plain text code block
    indented line
```

波浪线围栏：

~~~go
package main

func main() {}
~~~

很长的一行，观察是否换行或横向滚动：

```text
This is a very long line of code that should either wrap or scroll horizontally depending on the setting, it keeps going and going and going.
```

缩进代码块：

    indented code block
    second line
