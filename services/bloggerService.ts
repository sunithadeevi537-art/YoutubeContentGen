export interface Blog {
    id: string;
    name: string;
    url: string;
  }
  
  export interface Post {
    id: string;
    url: string;
    title: string;
  }
  
  // Fetches the list of blogs associated with the authenticated user
  export const fetchBlogs = async (accessToken: string): Promise<Blog[]> => {
    const response = await fetch('https://www.googleapis.com/blogger/v3/users/self/blogs', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
  
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to fetch blogs');
    }
  
    const data = await response.json();
    return data.items || [];
  };
  
  // Publishes a new post to the selected blog
  export const publishPost = async (
    blogId: string, 
    title: string, 
    content: string, 
    accessToken: string,
    isDraft: boolean = true
  ): Promise<Post> => {
    // Blogger API requires title and content. 
    // Content must be HTML.
    const body = {
      kind: 'blogger#post',
      blog: { id: blogId },
      title: title,
      content: content,
    };
  
    const response = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts?isDraft=${isDraft}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to publish post');
    }
  
    return await response.json();
  };